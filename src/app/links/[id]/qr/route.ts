import QRCode from "qrcode";

import { shortUrl } from "@/config/site";
import { getLink } from "@/lib/airtable/links";
import { auth } from "@/lib/auth";

/**
 * 링크의 QR 그림. `/links/<레코드ID>/qr?format=svg|png&download=1`.
 * QR에는 짧은 주소가 담긴다 — 넘길 주소를 나중에 바꿔도 인쇄한 QR은 그대로 쓴다.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user.member) return new Response("로그인이 필요하다", { status: 401 });

  const { id } = await context.params;
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return new Response("잘못된 주소", { status: 400 });

  const result = await getLink(id);
  if (!result.ok) return new Response(result.message, { status: 502 });
  if (!result.data) return new Response("링크가 없다", { status: 404 });

  const params = new URL(request.url).searchParams;
  const url = shortUrl(result.data.code);
  const options = { errorCorrectionLevel: "M", margin: 2 } as const;
  const disposition = params.get("download")
    ? `attachment; filename="qr-${result.data.code}.${params.get("format") === "png" ? "png" : "svg"}"`
    : "inline";

  if (params.get("format") === "png") {
    const png = await QRCode.toBuffer(url, { ...options, type: "png", width: 1024 });
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Content-Disposition": disposition, "Cache-Control": "private, max-age=3600" },
    });
  }
  const svg = await QRCode.toString(url, { ...options, type: "svg" });
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Content-Disposition": disposition, "Cache-Control": "private, max-age=3600" },
  });
}
