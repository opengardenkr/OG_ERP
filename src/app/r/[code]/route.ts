import { createHash } from "node:crypto";

import { unstable_cache } from "next/cache";
import { after, type NextRequest } from "next/server";

import { findLinkByCode, logScan } from "@/lib/airtable/links";
import { deviceOf, isBot, normalizeCode, previewPage, referrerHost } from "@/lib/link-stats";

/**
 * 추적 링크(짧은 주소) `/r/<코드>`. 로그인 없이 열린다(proxy.ts에서 뺐다) — 고객이 QR로 들어오는 문이다.
 * 대상 주소로 바로 넘기고(302), 스캔 기록은 응답을 보낸 뒤에 적는다 — 기록이 느리거나 실패해도 고객은 기다리지 않는다.
 * IP는 저장하지 않는다. 같은 사람을 묶는 해시만 남긴다.
 */

function notice(message: string, status: number): Response {
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>오픈가든</title><body style="font-family:system-ui,sans-serif;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f7f8f9;color:#172b4d"><div style="text-align:center;padding:24px"><p style="font-size:16px;font-weight:600">${message}</p><p style="font-size:14px;margin-top:12px"><a href="https://open-garden.co.kr" style="color:#0b6b3a">오픈가든 홈페이지로 가기</a></p></div></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

async function resolve(request: NextRequest, rawCode: string, count: boolean): Promise<Response> {
  const code = normalizeCode(rawCode);
  if (!code) return notice("없는 주소입니다.", 404);

  let link;
  try {
    link = await findLinkByCode(code);
  } catch {
    return notice("잠시 뒤 다시 열어 주세요.", 503);
  }
  if (!link) return notice("없는 주소입니다.", 404);
  if (!link.active) return notice("지금은 열리지 않는 주소입니다.", 410);

  const headers = request.headers;
  const userAgent = headers.get("user-agent");
  const prefetch = /prefetch|preview/i.test(headers.get("purpose") ?? headers.get("sec-purpose") ?? "");

  if (count && !prefetch && !isBot(userAgent)) {
    const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "";
    let city = headers.get("x-vercel-ip-city") ?? "";
    try {
      city = decodeURIComponent(city);
    } catch {
      /* 그대로 둔다 */
    }
    const scan = {
      at: new Date().toISOString(),
      device: deviceOf(userAgent),
      country: (headers.get("x-vercel-ip-country") ?? "").toUpperCase(),
      city,
      visitor: createHash("sha256")
        .update(`${process.env.AUTH_SECRET ?? ""}|${ip}|${userAgent ?? ""}`)
        .digest("hex")
        .slice(0, 12),
      referrer: referrerHost(headers.get("referer")),
    };
    after(async () => {
      try {
        await logScan(code, scan);
      } catch (error) {
        console.error("link scan log failed", code, error);
      }
    });
  }

  // 카톡·페이스북 등 미리보기 로봇은 넘겨주기(302)를 따라가지 않는다 — 대상 페이지의 og 태그를 담은 200 페이지를 준다.
  if (!prefetch && isBot(userAgent)) return preview(link.target, `${request.nextUrl.origin}/r/${code}`);

  return new Response(null, {
    status: 302,
    headers: { Location: link.target, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

/** 대상 페이지의 머리(head)만 읽는다 — 주문 링크 화면은 1MB가 넘어 끝까지 받으면 로봇이 기다리다 포기한다. */
async function readHead(target: string): Promise<string> {
  const r = await fetch(target, { headers: { "user-agent": "kakaotalk-scrap/1.0" }, redirect: "follow", signal: AbortSignal.timeout(6000) });
  if (!r.ok || !r.body) throw new Error(`target ${r.status}`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let head = "";
  while (head.length < 200_000) {
    const { done, value } = await reader.read();
    if (done) break;
    head += decoder.decode(value, { stream: true });
    const end = head.search(/<\/head>/i);
    if (end >= 0) { head = head.slice(0, end); break; }
  }
  await reader.cancel().catch(() => {});
  if (!/og:|<title>/i.test(head)) throw new Error("no og tags");
  return head;
}

/** 성공한 머리만 1시간 기억한다(실패는 던져서 기억하지 않는다) — 두 번째 로봇부터는 대상을 기다리지 않는다. */
const cachedHead = unstable_cache(readHead, ["link-preview-head"], { revalidate: 3600 });

/** 미리보기 로봇용 작은 페이지. 대상을 못 읽어도 짧은 주소의 og:url은 남긴다. */
async function preview(target: string, selfUrl: string): Promise<Response> {
  let head = "";
  try {
    head = await cachedHead(target);
  } catch {
    /* 대상이 느리거나 막혀도 빈 머리로 그린다 */
  }
  return new Response(previewPage(head, selfUrl, target), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  return resolve(request, (await context.params).code, true);
}

/** HEAD는 주소 확인용이다. 넘기기만 하고 세지 않는다. */
export async function HEAD(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  return resolve(request, (await context.params).code, false);
}
