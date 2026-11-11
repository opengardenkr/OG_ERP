/** 추적 링크(짧은 주소)가 붙는 주소. 인쇄한 QR이 이 주소를 담으므로 바꾸면 기존 QR이 깨진다. */
export const SHORT_LINK_ORIGIN = "https://app.open-garden.co.kr";

export function shortUrl(code: string): string {
  return `${SHORT_LINK_ORIGIN}/r/${code}`;
}
