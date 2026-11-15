import { ImageResponse } from "next/og";

import { shortUrl } from "@/config/site";
import { getLink } from "@/lib/airtable/links";
import { auth } from "@/lib/auth";
import { QR_ASSETS } from "@/lib/qr-assets";
import { qrStyleOf, qrSvg } from "@/lib/qr-design";

/**
 * 링크의 QR 그림. `/links/<레코드ID>/qr?style=plain|frame&format=svg|png&download=1`.
 * QR에는 짧은 주소가 담긴다 — 넘길 주소를 나중에 바꿔도 인쇄한 QR은 그대로 쓴다.
 * PNG는 같은 SVG를 Next 내장 그림 엔진(next/og)으로 굽는다. 글자·로고가 SVG 안에 그림으로 들어 있어 글꼴이 필요 없다.
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
  const style = qrStyleOf(params.get("style"));
  const png = params.get("format") === "png";
  const { svg, width, height } = qrSvg(shortUrl(result.data.code), style, QR_ASSETS);
  const name = `qr-${result.data.code}${style === "frame" ? "-scanme" : ""}.${png ? "png" : "svg"}`;
  const headers = {
    "Content-Disposition": params.get("download") ? `attachment; filename="${name}"` : "inline",
    "Cache-Control": "private, max-age=3600",
  };

  if (png) {
    const w = 1200;
    const h = Math.round((w * height) / width);
    const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    return new ImageResponse(
      (
        // eslint-disable-next-line @next/next/no-img-element -- next/og는 img만 받는다
        <img src={src} width={w} height={h} alt="" />
      ),
      { width: w, height: h, headers },
    );
  }
  return new Response(svg, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
}
