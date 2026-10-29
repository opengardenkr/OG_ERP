import "server-only";

import { unstable_cache } from "next/cache";
import { fail, ok, type Result } from "@/lib/result";
import {
  buildProposal,
  genusFormula,
  literal,
  parseHues,
  type MasterInfo,
  type Proposal,
  type SourceRow,
  type TermRow,
} from "@/lib/genus-proposal";

/**
 * 속명 제안서가 읽는 표 3개. 읽기만 한다.
 * 가격·재고 = 호게나르드 DM / 품종 정보·사진 = 식물 등록 마스터 / 문구 = [영업] 제안서 조건
 * 필드는 ID로 부른다 — 호게나르드 DM의 SKU 이름 앞에 보이지 않는 BOM 문자가 있다.
 */
const DM = "tblVVRTKfyViCI1aW";
const MASTER = "tbln0zg9JdWCJKoFU";
const TERMS = "tblInjLsjEyaKLltL";
const LINEUP = "호게나르드 DM";

const D = {
  sku: "fldYExrwAE5gPA5lz", name: "fld3XAFUiRqL9I5xM", latin: "fldHpENoNezkg0YrO",
  size: "fldqrGhf56NzhOusv", price: "flddWryT0w8bnvmis", stock: "fldXhGrdwcxMMFQhF",
  stockDate: "fldJWWs2pnYgye9ki", hidden: "fldkXhOo3KTpUhuZ6", genus: "fldFMn3AIHfab5jFR",
  master: "fldIuMwaETRZYljic",
};
const M = {
  name: "fldB0eCbhFU9TMrmv", latin: "fldYz1JOc5Yk6RnyA", features: "fldMUBTzgpPgzkBUQ",
  sizeClass: "fldKSL10IObmdmq2A", heightMin: "fldH8L3zr8NdhHJVk", heightMax: "fldlcgNAYfmXK4hfu",
  width: "fld0sV9WPiwktbocv", hues: "fldVqotycqMkVHY0b", award: "fldpx6e4fbl9oSJA7",
  series: "fldWHEHcDpuYZ1zLv", photo: "fldkieDK6VuDl3bkW", photoCredit: "fldpMijVoEii0Beti",
  review: "fldqzabS5f9ijWIPv",
};
const T = {
  lineup: "fldc320aaj9BEwEbe", series: "fldDIcutG6o6E5jCz", lines: "fldtwjSWaHno4HNPJ",
  legend: "fldq7jTmmaoPe1ebu", few: "fldQkuRFWpcMnp0sK", seriesTitle: "fldIw9vP4vJM9Vz0Q",
  seriesTiles: "fldrEkRI7Alcy5DUL", active: "fld13WUCxtiRkBx0N",
};

type Fields = Record<string, unknown>;
type Raw = { id: string; fields: Fields };

async function readAll(table: string, fields: string[], formula?: string): Promise<Raw[]> {
  const token = process.env.AIRTABLE_TOKEN?.trim(), base = process.env.AIRTABLE_BASE_ID?.trim();
  if (!token || !base) throw new Error("Airtable 연결 설정(AIRTABLE_TOKEN, AIRTABLE_BASE_ID)을 확인해 주세요.");
  const out: Raw[] = [];
  let offset = "";
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
    fields.forEach((f) => params.append("fields[]", f));
    if (formula) params.set("filterByFormula", formula);
    if (offset) params.set("offset", offset);
    const response = await fetch(`https://api.airtable.com/v0/${base}/${table}?${params}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(response.status === 403
        ? "제안서에 필요한 표를 읽을 권한이 없습니다. 포털 토큰의 베이스 접근 범위를 확인해 주세요."
        : response.status === 429 ? "요청이 많습니다. 잠시 후 다시 시도해 주세요." : `제안서 자료를 불러오지 못했습니다 (${response.status}).`);
    }
    const data = (await response.json()) as { records: Raw[]; offset?: string };
    out.push(...data.records);
    offset = data.offset || "";
    if (!offset) break;
  }
  return out;
}

const text = (f: Fields, k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");
const num = (f: Fields, k: string) => (typeof f[k] === "number" ? (f[k] as number) : null);
const ids = (f: Fields, k: string) => (Array.isArray(f[k]) ? (f[k] as unknown[]).filter((v): v is string => typeof v === "string") : []);

function toRow(r: Raw): SourceRow {
  const f = r.fields;
  return {
    id: r.id, sku: text(f, D.sku).trim(), name: text(f, D.name), latin: text(f, D.latin), size: text(f, D.size),
    price: num(f, D.price), stock: num(f, D.stock), stockDate: text(f, D.stockDate), masterId: ids(f, D.master)[0] ?? null,
  };
}

function toMaster(r: Raw): MasterInfo {
  const f = r.fields;
  const photos = Array.isArray(f[M.photo]) ? (f[M.photo] as { url?: string; type?: string }[]) : [];
  const photo = photos.find((p) => p.url && (!p.type || p.type.startsWith("image/")));
  return {
    id: r.id, name: text(f, M.name), latin: text(f, M.latin),
    features: text(f, M.features).split("\n").map((s) => s.trim()).filter(Boolean),
    sizeClass: text(f, M.sizeClass), heightMin: num(f, M.heightMin), heightMax: num(f, M.heightMax),
    width: num(f, M.width), hues: parseHues(text(f, M.hues)), award: text(f, M.award), series: text(f, M.series),
    photo: photo?.url || "", photoCredit: text(f, M.photoCredit), review: text(f, M.review),
  };
}

function toTerm(r: Raw): TermRow {
  const f = r.fields;
  return {
    series: text(f, T.series).trim(), lines: text(f, T.lines), legend: text(f, T.legend), few: num(f, T.few),
    seriesTitle: text(f, T.seriesTitle), seriesTiles: text(f, T.seriesTiles),
  };
}

export type GenusOption = { genus: string; inStock: number };

/** 속명 고르기 목록. 노출제외를 뺀 현지재고 있는 행 수와 함께. */
export const listGenera = unstable_cache(
  async (): Promise<GenusOption[]> => {
    const rows = await readAll(DM, [D.genus, D.stock, D.hidden]);
    const count = new Map<string, number>();
    for (const r of rows) {
      const g = text(r.fields, D.genus);
      if (!g || r.fields[D.hidden] === true) continue;
      const stock = num(r.fields, D.stock) ?? 0;
      count.set(g, (count.get(g) || 0) + (stock > 0 ? 1 : 0));
    }
    return [...count.entries()].map(([genus, inStock]) => ({ genus, inStock })).sort((a, b) => a.genus.localeCompare(b.genus, "ko"));
  },
  ["genus-proposal", "genera"],
  { revalidate: 600, tags: [`airtable:${DM}`] },
);

/**
 * 사진 주소는 Airtable이 몇 시간 뒤 만료시키므로 오래 캐시하지 않는다(5분).
 * 성공한 결과만 캐시된다 — 실패는 예외로 나가 저장되지 않는다.
 */
const loadSource = unstable_cache(
  async (genus: string) => {
    const rows = (await readAll(DM, Object.values(D), genusFormula(genus))).map(toRow);
    const masterIds = [...new Set(rows.map((r) => r.masterId).filter((v): v is string => Boolean(v)))];
    const masters: MasterInfo[] = [];
    for (let i = 0; i < masterIds.length; i += 50) {
      const chunk = masterIds.slice(i, i + 50);
      const formula = `OR(${chunk.map((id) => `RECORD_ID()=${literal(id)}`).join(",")})`;
      masters.push(...(await readAll(MASTER, Object.values(M), formula)).map(toMaster));
    }
    const terms = (await readAll(TERMS, Object.values(T), `AND({사용},{적용 표}=${literal(LINEUP)})`)).map(toTerm);
    return { rows, masters, terms };
  },
  ["genus-proposal", "source"],
  { revalidate: 300, tags: [`airtable:${DM}`, `airtable:${MASTER}`, `airtable:${TERMS}`] },
);

export async function getGenusProposal(genus: string, query: string, onlyInStock: boolean): Promise<Result<Proposal>> {
  try {
    const { rows, masters, terms } = await loadSource(genus);
    return ok(buildProposal(rows, masters, terms, { genus, query, onlyInStock }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "제안서 자료를 불러오지 못했습니다.");
  }
}

export async function getGenera(): Promise<Result<GenusOption[]>> {
  try {
    return ok(await listGenera());
  } catch (error) {
    return fail(error instanceof Error ? error.message : "속명 목록을 불러오지 못했습니다.");
  }
}
