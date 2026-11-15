import QRCode from "qrcode";

/** 디자인에 쓰는 그림(로고·SCAN ME 글자). 실제 값은 `qr-assets.ts` — 테스트가 가벼운 값을 넣을 수 있게 밖에서 받는다. */
export type QrAssets = { logo: string; scanMe: { path: string; width: number; capHeight: number } };

/**
 * 링크 QR 디자인 두 가지(qr.io에서 쓰던 모양).
 * - plain: 둥근 눈 + 가운데 오픈가든 로고
 * - frame: 같은 QR을 둥근 검은 틀에 넣고 위에 SCAN ME
 * 가운데 로고가 칸을 가리므로 오류 복원 H(30%)로 만든다. 단위는 QR 한 칸(모듈).
 */
export const QR_STYLES = [
  { id: "plain", label: "기본" },
  { id: "frame", label: "SCAN ME" },
] as const;
export type QrStyle = (typeof QR_STYLES)[number]["id"];

export function qrStyleOf(value: string | null | undefined): QrStyle {
  return value === "frame" ? "frame" : "plain";
}

const n2 = (v: number) => Number(v.toFixed(3)).toString();

/** 모서리가 둥근 사각형 한 바퀴(시계 방향). */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${n2(x + r)} ${n2(y)}H${n2(x + w - r)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(x + w)} ${n2(y + r)}` +
    `V${n2(y + h - r)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(x + w - r)} ${n2(y + h)}` +
    `H${n2(x + r)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(x)} ${n2(y + h - r)}` +
    `V${n2(y + r)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(x + r)} ${n2(y)}Z`
  );
}

export type QrBody = {
  /** 한 변의 칸 수 */
  size: number;
  /** 일반 칸(눈·로고 자리 뺌). 가로로 이어진 칸은 한 막대로 합쳤다. */
  modules: string;
  /** 눈 세 개(바깥 고리 + 가운데 점). fill-rule evenodd로 그린다. */
  eyes: string;
  /** 로고를 놓을 자리(칸을 비운 정사각형) */
  logo: { start: number; length: number };
};

export function qrBody(text: string): QrBody {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = modules.size;
  const dark = (r: number, c: number) => modules.get(r, c) === 1;
  const inEye = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  // 로고 자리: 한 변의 약 24%, 가운데에 오도록 홀짝을 맞춘다.
  let length = Math.round(n * 0.24);
  if ((n - length) % 2 !== 0) length += 1;
  const start = (n - length) / 2;
  const inLogo = (r: number, c: number) => r >= start && r < start + length && c >= start && c < start + length;

  let path = "";
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (!dark(r, c) || inEye(r, c) || inLogo(r, c)) continue;
      let run = 1;
      while (c + run < n && dark(r, c + run) && !inEye(r, c + run) && !inLogo(r, c + run)) run += 1;
      path += `M${c} ${r}h${run}v1h-${run}z`;
      c += run - 1;
    }
  }

  let eyes = "";
  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    eyes += roundRect(x, y, 7, 7, 2) + roundRect(x + 1, y + 1, 5, 5, 1.25) + roundRect(x + 2, y + 2, 3, 3, 0.85);
  }

  return { size: n, modules: path, eyes, logo: { start, length } };
}

function qrGroup(body: QrBody, x: number, y: number, logo: string): string {
  const inset = 0.5;
  const { start, length } = body.logo;
  return (
    `<g transform="translate(${n2(x)} ${n2(y)})">` +
    `<path d="${body.modules}" fill="#000"/>` +
    `<path d="${body.eyes}" fill="#000" fill-rule="evenodd"/>` +
    `<image x="${n2(start + inset)}" y="${n2(start + inset)}" width="${n2(length - inset * 2)}" height="${n2(length - inset * 2)}" ` +
    `preserveAspectRatio="xMidYMid meet" xlink:href="${logo}"/>` +
    `</g>`
  );
}

/** 틀 모양 치수(칸 단위). 인쇄했을 때 qr.io 틀과 비슷한 비율. */
const FRAME = { margin: 1, stroke: 1.5, pad: 1.8, outerRadius: 3.2, textTop: 1.4, capHeight: 2.6, textGap: 1.5 };
const QUIET = 2;

export type QrSvg = { svg: string; width: number; height: number };

/** 디자인 하나를 SVG로. width·height는 칸 단위(PNG 비율 계산용). */
export function qrSvg(text: string, style: QrStyle, assets: QrAssets): QrSvg {
  const { logo, scanMe } = assets;
  const body = qrBody(text);
  const n = body.size;
  const open = (w: number, h: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${n2(w)} ${n2(h)}" width="${n2(w * 10)}" height="${n2(h * 10)}">` +
    `<rect width="100%" height="100%" fill="#fff"/>`;

  if (style === "plain") {
    const side = n + QUIET * 2;
    return { svg: open(side, side) + qrGroup(body, QUIET, QUIET, logo) + `</svg>`, width: side, height: side };
  }

  const { margin, stroke, pad, outerRadius, textTop, capHeight, textGap } = FRAME;
  const inner = n + pad * 2;
  const box = inner + stroke * 2;
  const width = box + margin * 2;
  const boxTop = textTop + capHeight + textGap;
  const height = boxTop + box + margin;

  const scale = capHeight / scanMe.capHeight;
  const textX = (width - scanMe.width * scale) / 2;
  const ring =
    roundRect(margin, boxTop, box, box, outerRadius) +
    roundRect(margin + stroke, boxTop + stroke, inner, inner, Math.max(0.6, outerRadius - stroke));

  return {
    svg:
      open(width, height) +
      `<path transform="translate(${n2(textX)} ${n2(textTop)}) scale(${scale.toPrecision(5)})" d="${scanMe.path}" fill="#000"/>` +
      `<path d="${ring}" fill="#000" fill-rule="evenodd"/>` +
      qrGroup(body, margin + stroke + pad, boxTop + stroke + pad, logo) +
      `</svg>`,
    width,
    height,
  };
}
