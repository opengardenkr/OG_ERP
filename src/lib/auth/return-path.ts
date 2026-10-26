/** Only allow local paths as OAuth return destinations. */
export function loginReturnPath(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/") ||
      value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  const url = new URL(value, "https://portal.invalid");
  if (url.origin !== "https://portal.invalid" ||
      /^\/(?:login|api\/auth)(?:\/|$)/.test(url.pathname)) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
