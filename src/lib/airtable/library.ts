import "server-only";

import {
  AirtableError,
  createRecord,
  deleteRecord,
  getRecordFresh,
  selectRecords,
  updateRecord,
} from "@/lib/airtable/client";
import { fail, ok, type Result } from "@/lib/result";

/** `[포털] 자료실`. 자료 한 줄 = 파일 하나. */
export const LIBRARY_TABLE = "tblaZ9jj0TgG7xBjm";
const FILE_FIELD_ID = "fld3ljwoIAIGR2pfb";

type Attachment = {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
  thumbnails?: { small?: { url: string }; large?: { url: string } };
};

/** Airtable의 한글 필드명. 이 파일 밖으로 나가지 않는다. */
type Row = {
  제목: string;
  설명: string;
  분류: string;
  파일: Attachment[];
  경로: string;
  미리보기경로: string;
  등록일: string;
  등록자: string;
  사용여부: boolean;
};

export const LIBRARY_CATEGORIES = ["영업", "수입", "시공", "자재", "내부"] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

export type LibraryItem = {
  id: string;
  title: string;
  description: string;
  category: LibraryCategory;
  /**
   * 파일을 여는 주소. 만료되지 않는다 — 첨부면 `/library/<id>/file`(열 때마다 새 Airtable URL로 302),
   * 저장소 파일이면 `/library/…` 그대로.
   */
  fileUrl: string;
  fileName: string;
  /** 1쪽 미리보기 주소(`/library/<id>/thumb` 또는 저장소 경로). 없으면 null — 카드는 파일명만 보인다. */
  thumbUrl: string | null;
  date: string;
  author: string;
};

/**
 * 자료 목록. 사용여부가 켜진 행만, 등록일 내림차순.
 * 화면에는 만료되는 Airtable URL을 내보내지 않는다 — 고정 주소(`/library/<id>/file`)만 준다. 캐시 10분.
 */
export async function getLibrary(): Promise<Result<LibraryItem[]>> {
  try {
    const records = await selectRecords<Row>(LIBRARY_TABLE, {
      fields: ["제목", "설명", "분류", "파일", "경로", "미리보기경로", "등록일", "등록자"],
      filterByFormula: "{사용여부} = TRUE()",
      sort: [{ field: "등록일", direction: "desc" }],
      revalidate: 600,
    });

    const items = records.flatMap<LibraryItem>((record) => {
      const f = record.fields;
      const attachment = f.파일?.[0];
      const repoPath = f.경로?.trim() || null;
      if (!f.제목 || (!attachment && !repoPath)) return [];
      const category = (LIBRARY_CATEGORIES as readonly string[]).includes(f.분류 ?? "")
        ? (f.분류 as LibraryCategory)
        : "내부";
      // 첨부는 늘 고정 주소. 올린 직후 Airtable이 썸네일을 아직 안 만들었으면 그 주소가 404라
      // 카드가 파일명으로 대신하고(LibraryThumb), 몇십 초 뒤 새로고침하면 미리보기가 뜬다.
      const thumbUrl = attachment ? `/library/${record.id}/thumb` : f.미리보기경로?.trim() || null;
      return [
        {
          id: record.id,
          title: f.제목,
          description: f.설명 ?? "",
          category,
          fileUrl: attachment ? `/library/${record.id}/file` : repoPath!,
          fileName: attachment?.filename ?? repoPath!.split("/").pop() ?? "파일",
          thumbUrl,
          date: f.등록일 ?? "",
          author: f.등록자 ?? "",
        },
      ];
    });

    return ok(items);
  } catch (error) {
    if (error instanceof AirtableError) return fail(error.message);
    throw error;
  }
}

/**
 * 자료 한 건을 올린다. 줄을 만든 뒤 Airtable의 첨부 업로드 엔드포인트로 파일을 붙인다
 * (base64, 5MB 한도). 파일 저장은 Airtable이 한다 — 우리는 들고 있지 않는다(원칙 2·3).
 */
export async function addLibraryItem(input: {
  title: string;
  description: string;
  category: LibraryCategory;
  author: string;
  file: File;
}): Promise<void> {
  const record = await createRecord<Row>(LIBRARY_TABLE, {
    제목: input.title,
    설명: input.description,
    분류: input.category,
    등록일: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
    등록자: input.author,
    사용여부: false, // 파일이 붙은 뒤에 켠다. 빈 줄이 목록에 보이지 않게.
  });

  const token = (process.env.AIRTABLE_TOKEN ?? "").trim();
  const baseId = (process.env.AIRTABLE_BASE_ID ?? "").trim();
  const bytes = Buffer.from(await input.file.arrayBuffer());

  const upload = await fetch(
    `https://content.airtable.com/v0/${baseId}/${record.id}/${FILE_FIELD_ID}/uploadAttachment`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType: input.file.type || "application/octet-stream",
        filename: input.file.name,
        file: bytes.toString("base64"),
      }),
      cache: "no-store",
    },
  );
  if (!upload.ok) {
    await deleteRecord(LIBRARY_TABLE, record.id);
    throw new AirtableError(`파일 업로드 실패 (${upload.status})`);
  }

  await updateRecord<Row>(LIBRARY_TABLE, record.id, { 사용여부: true });
}

/**
 * 고정 주소가 가리킬 지금의 Airtable URL. 캐시 없이 읽는다 — Airtable은 읽을 때마다 새 서명 URL을 준다.
 * 첨부가 없고 저장소 경로만 있으면 그 경로. 없으면 null.
 */
export async function resolveLibraryUrl(id: string, kind: "file" | "thumb"): Promise<string | null> {
  const record = await getRecordFresh<Row>(LIBRARY_TABLE, id);
  if (!record) return null;
  const f = record.fields;
  const attachment = f.파일?.[0];
  if (kind === "file") return attachment?.url ?? f.경로?.trim() ?? null;
  return attachment?.thumbnails?.large?.url ?? f.미리보기경로?.trim() ?? null;
}

export async function removeLibraryItem(id: string): Promise<void> {
  await deleteRecord(LIBRARY_TABLE, id);
}
