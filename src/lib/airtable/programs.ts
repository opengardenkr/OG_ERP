import "server-only";

import { AirtableError, selectRecords } from "@/lib/airtable/client";
import { fail, ok, type Result } from "@/lib/result";

const TABLE = "tblPMe2YBiKlgHBEN";

/** Airtable의 한글 필드명. 이 파일 밖으로 나가지 않는다. */
type Row = {
  이름: string;
  설명: string;
  경로: string;
  아이콘: string;
  분류: string;
  노출순서: number;
  사용여부: boolean;
  새창열기: boolean;
  "미리보기 이미지"?: string;
};

export type ProgramCategory = "영업" | "문서" | "재고" | "지도" | "기타";

export type Program = {
  id: string;
  name: string;
  description: string;
  /** 내부는 /tools/quote.html, 외부는 https:// 전체 주소 */
  href: string;
  /** lucide-react 아이콘 이름 */
  icon: string;
  category: ProgramCategory;
  order: number;
  newTab: boolean;
  previewImage?: string;
};

/**
 * 포털 홈 카드 목록.
 * 사용여부가 켜진 행만, 노출순서 오름차순.
 * 거의 바뀌지 않으므로 10분 캐시.
 */
export async function getPrograms(): Promise<Result<Program[]>> {
  try {
    const records = await selectRecords<Row>(TABLE, {
      fields: ["이름", "설명", "경로", "아이콘", "분류", "노출순서", "새창열기", "미리보기 이미지"],
      filterByFormula: "{사용여부} = TRUE()",
      sort: [{ field: "노출순서", direction: "asc" }],
      revalidate: 600,
    });

    const programs = records
      .filter((record) => record.fields.이름 && record.fields.경로)
      .map<Program>((record) => ({
        id: record.id,
        name: record.fields.이름 as string,
        description: record.fields.설명 ?? "",
        href: record.fields.경로 as string,
        icon: record.fields.아이콘 ?? "app-window",
        category: (record.fields.분류 ?? "기타") as ProgramCategory,
        order: record.fields.노출순서 ?? 0,
        newTab: record.fields.새창열기 ?? false,
        previewImage: record.fields["미리보기 이미지"]?.trim() || undefined,
      }));

    return ok(programs);
  } catch (error) {
    if (error instanceof AirtableError) return fail(error.message);
    throw error;
  }
}
