import { auth } from "@/lib/auth";

/**
 * 로그인하지 않으면 아무것도 못 본다.
 * public/tools/ 의 정적 HTML 도구도 여기서 함께 막힌다.
 */
export default auth((req) => {
  if (req.auth) {
    const routes: Record<string, string> = {
      "/tools/proposal.html": "/proposal", "/tools/quote.html": "/quote",
      "/tools/catalog-bridge.html": "/catalog", "/tools/order.html": "/catalog",
    };
    const destination = routes[req.nextUrl.pathname];
    if (destination && req.nextUrl.searchParams.get("embedded") !== "1") {
      const url = new URL(destination, req.nextUrl.origin);
      url.search = req.nextUrl.search;
      return Response.redirect(url);
    }
    return;
  }

  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("from", req.nextUrl.pathname + req.nextUrl.search);
  return Response.redirect(url);
});

export const config = {
  matcher: [
    // 아래를 뺀 모든 경로
    //   api/auth  로그인 처리 자체
    //   login     로그인 화면
    //   _next     프레임워크 자산
    //   favicon
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
