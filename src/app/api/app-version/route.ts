import { auth } from "@/lib/auth";
import { getAppRelease } from "@/lib/app-release";

/** Always read the currently deployed version. Never cache this response. */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(getAppRelease(), {
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate", "Vary": "Cookie" },
  });
}
