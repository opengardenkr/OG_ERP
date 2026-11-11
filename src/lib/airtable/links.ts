import "server-only";

import {
  AirtableError,
  createRecord,
  getRecord,
  selectRecords,
  selectRecordsFresh,
  updateRecord,
} from "@/lib/airtable/client";
import { LINK_CATEGORIES, type LinkCategory, type Scan } from "@/lib/link-stats";
import { fail, ok, type Result } from "@/lib/result";

/** `[포털] 링크`. 한 줄 = 짧은 주소 하나. */
export const LINKS_TABLE = "tblirXnsDlug2lq9V";
/** `[포털] 링크 스캔`. 한 줄 = 한 번 열림. */
export const LINK_SCANS_TABLE = "tblmV198RGEbNzaUV";

/** Airtable의 한글 필드명. 이 파일 밖으로 나가지 않는다. */
type LinkRow = {
  이름: string;
  코드: string;
  대상주소: string;
  분류: string;
  메모: string;
  사용여부: boolean;
  작성자: string;
  생성일: string;
};

type ScanRow = {
  코드: string;
  시각: string;
  기기: string;
  국가: string;
  도시: string;
  방문자: string;
  유입: string;
};

export type TrackedLink = {
  id: string;
  name: string;
  code: string;
  target: string;
  category: LinkCategory;
  memo: string;
  /** false면 일시정지 — 짧은 주소가 안내 화면만 보인다. */
  active: boolean;
  author: string;
  created: string;
};

const LINK_FIELDS = ["이름", "코드", "대상주소", "분류", "메모", "사용여부", "작성자", "생성일"];

function toLink(record: { id: string; fields: Partial<LinkRow> }): TrackedLink | null {
  const f = record.fields;
  if (!f.이름 || !f.코드 || !f.대상주소) return null;
  return {
    id: record.id,
    name: f.이름,
    code: f.코드,
    target: f.대상주소,
    category: (LINK_CATEGORIES as readonly string[]).includes(f.분류 ?? "") ? (f.분류 as LinkCategory) : "기타",
    memo: f.메모 ?? "",
    active: f.사용여부 === true,
    author: f.작성자 ?? "",
    created: f.생성일 ?? "",
  };
}

/** 링크 전체(일시정지 포함). 캐시 5분 — 고치면 바로 버려진다. */
async function readLinks(): Promise<TrackedLink[]> {
  const records = await selectRecords<LinkRow>(LINKS_TABLE, {
    fields: LINK_FIELDS,
    sort: [{ field: "생성일", direction: "desc" }],
    revalidate: 300,
  });
  return records.flatMap((record) => toLink(record) ?? []);
}

export async function getLinks(): Promise<Result<TrackedLink[]>> {
  try {
    return ok(await readLinks());
  } catch (error) {
    if (error instanceof AirtableError) return fail(error.message);
    throw error;
  }
}

export async function getLink(id: string): Promise<Result<TrackedLink | null>> {
  try {
    const record = await getRecord<LinkRow>(LINKS_TABLE, id, 300);
    return ok(record ? toLink(record) : null);
  } catch (error) {
    if (error instanceof AirtableError) return fail(error.message);
    throw error;
  }
}

/** 짧은 주소가 열릴 때 쓴다. 캐시된 목록에서 찾는다 — 스캔마다 Airtable을 읽지 않는다. 실패는 던진다. */
export async function findLinkByCode(code: string): Promise<TrackedLink | null> {
  return (await readLinks()).find((link) => link.code === code) ?? null;
}

/** 캐시 없이 코드가 이미 쓰이는지 본다. code는 normalizeCode를 통과한 값만 넣는다. */
export async function codeTaken(code: string): Promise<boolean> {
  const rows = await selectRecordsFresh<LinkRow>(LINKS_TABLE, {
    fields: ["코드"],
    filterByFormula: `{코드} = '${code}'`,
    maxRecords: 1,
  });
  return rows.length > 0;
}

export async function addLink(input: {
  name: string;
  code: string;
  target: string;
  category: LinkCategory;
  memo: string;
  author: string;
}): Promise<string> {
  const record = await createRecord<LinkRow>(LINKS_TABLE, {
    이름: input.name,
    코드: input.code,
    대상주소: input.target,
    분류: input.category,
    메모: input.memo || null,
    사용여부: true,
    작성자: input.author,
    생성일: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
  });
  return record.id;
}

/** 이름·넘길 주소·분류·메모만 고친다. 코드는 못 바꾼다 — 인쇄한 QR이 깨진다. */
export async function editLink(
  id: string,
  input: { name: string; target: string; category: LinkCategory; memo: string },
): Promise<void> {
  await updateRecord<LinkRow>(LINKS_TABLE, id, {
    이름: input.name,
    대상주소: input.target,
    분류: input.category,
    메모: input.memo || null,
  });
}

export async function setLinkActive(id: string, active: boolean): Promise<void> {
  await updateRecord<LinkRow>(LINKS_TABLE, id, { 사용여부: active });
}

/** 스캔 한 줄을 적는다. 짧은 주소 라우트가 응답을 보낸 뒤에 부른다. */
export async function logScan(code: string, scan: Scan): Promise<void> {
  await createRecord<ScanRow>(LINK_SCANS_TABLE, {
    코드: code,
    시각: scan.at,
    기기: scan.device,
    국가: scan.country || null,
    도시: scan.city || null,
    방문자: scan.visitor,
    유입: scan.referrer || null,
  });
}

export type ScanOfLink = Scan & { code: string };

/**
 * 최근 N일 스캔(최신순). code를 주면 그 링크만.
 * 날짜 경계는 코드(summarize)가 한국 기준으로 다시 자른다 — 여기서는 하루 넉넉히 가져온다.
 * 한 번에 1,000줄까지 읽힌다(client.ts). 최신순이라 넘치면 오래된 쪽이 빠진다.
 */
export async function getScans(days: number, code?: string): Promise<Result<ScanOfLink[]>> {
  try {
    const recent = `IS_AFTER({시각}, DATEADD(NOW(), -${days + 1}, 'days'))`;
    const records = await selectRecords<ScanRow>(LINK_SCANS_TABLE, {
      fields: ["코드", "시각", "기기", "국가", "도시", "방문자", "유입"],
      filterByFormula: code ? `AND({코드} = '${code}', ${recent})` : recent,
      sort: [{ field: "시각", direction: "desc" }],
      revalidate: 60,
    });
    return ok(
      records.flatMap<ScanOfLink>((record) => {
        const f = record.fields;
        if (!f.코드 || !f.시각) return [];
        return [
          {
            code: f.코드,
            at: f.시각,
            device: f.기기 ?? "",
            country: f.국가 ?? "",
            city: f.도시 ?? "",
            visitor: f.방문자 ?? "",
            referrer: f.유입 ?? "",
          },
        ];
      }),
    );
  } catch (error) {
    if (error instanceof AirtableError) return fail(error.message);
    throw error;
  }
}

/** 한 번에 읽히는 스캔 줄 수 한도(client.ts의 10장 × 100줄). 닿으면 화면이 알린다. */
export const SCAN_READ_LIMIT = 1000;
