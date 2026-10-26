import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "업데이트 소식 | 오픈가든",
  robots: { index: false, follow: false },
};

const updates = [
  { title: "식물 고유번호", desc: "국내 54종에 OG-P 번호가 생겼고, 규격별 상품 59건과 연결했어요.", stage: "Airtable 적용 완료", ok: true },
  { title: "사진 카탈로그", desc: "식물을 사진으로 찾고 골라볼 수 있도록 수정 코드를 준비했어요.", stage: "코드 테스트 완료 · 배포 전", ok: false },
  { title: "사진 워터마크", desc: "고객에게 보여주는 사진 하단에 오픈가든 로고를 넣는 기능을 준비했어요.", stage: "코드 테스트 완료 · 배포 전", ok: false },
  { title: "제안서·견적서 연동", desc: "웹 카탈로그가 보내는 식물 목록을 제안서로 불러오고, 견적서용 목록을 복사할 수 있어요. 웹 카탈로그 공개는 별도예요.", stage: "이번 ERP 업데이트에 연결 코드 포함 · 연동 테스트 필요", ok: false },
  { title: "검색 노출 개선", desc: "품종별 검색 페이지와 사이트맵을 만들었어요. 검색엔진 등록은 남아 있어요.", stage: "코드 테스트 완료 · 배포 전", ok: false },
  { title: "영업 지도", desc: "거래처와 관공서 기록을 같은 화면에서 확인해요. 실제 지도 핀은 네이버 지도 설정을 마친 뒤 확인해야 해요.", stage: "이번 ERP 업데이트에 포함 · 지도 인증 필요", ok: false },
  { title: "새 버전 알림", desc: "ERP가 업데이트되면 알려줘요. 일을 쓰는 중이라면 자동으로 새로고침하지 않아요.", stage: "이번 ERP 업데이트에 포함 · 배포 후 검증", ok: false },
];

export default function UpdatesPage() {
  const isPreview = process.env.VERCEL_ENV === "preview";
  return (
    <AppShell title="업데이트 소식" subtitle="2026년 10월 27일 · 오픈가든 시스템 소식">
      <div className="rounded-lg border border-line bg-white p-4">
        <p className="font-semibold text-ink">무엇이 달라지나요?</p>
        <p className="mt-1 text-sm text-muted">식물을 찾고, 거래처를 방문하고, 제안서를 만드는 일이 더 쉬워져요.</p>
        <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">{isPreview ? "현재 테스트 환경입니다. 제안서 연결·영업 지도·새 버전 알림 코드는 이 Preview에 반영되어 있습니다. 실제 업무 데이터와 연결될 수 있으므로 확인할 때는 저장·발행하지 마세요." : "ERP 기능과 별도 웹사이트 작업의 진행 상황을 안내합니다. 아래 항목은 설치 버튼이 아니며, 실제 이용 여부는 연결 설정과 검증 결과에 따라 달라집니다."}</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {updates.map(item => (
          <article key={item.title} className="rounded-lg border border-line bg-white p-4">
            <h2 className="font-semibold text-ink">{item.title}</h2>
            <p className="mt-2 text-sm text-muted">{item.desc}</p>
            <p className={`mt-3 text-xs font-semibold ${item.ok ? "text-green-700" : "text-amber-700"}`}>{isPreview && ["제안서·견적서 연동", "영업 지도", "새 버전 알림"].includes(item.title) ? `Preview 반영 · ${item.title === "영업 지도" ? "지도 인증·핀 표시 확인 필요" : item.title === "새 버전 알림" ? "새 배포 감지·입력 보호 확인 필요" : "선택 품목 가져오기 확인 필요"}` : item.stage}</p>
          </article>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <Link className="btn" href="/sales-map">영업 지도 보기 →</Link>
        <Link className="btn" href="/programs">프로그램 보기 →</Link>
        <a className="btn" href="/tools/proposal.html" target="_blank" rel="noopener noreferrer">제안서 열기 ↗</a>
        <a className="btn" href="/tools/catalog-bridge.html" target="_blank" rel="noopener noreferrer">카탈로그 선택 품목 ↗</a>
      </div>
      <p className="mt-4 text-xs text-muted">사진 카탈로그·워터마크·검색 노출 개선은 별도 웹사이트 작업입니다. ERP의 업데이트 확인 버튼은 새로 배포된 버전을 확인하며, 별도 웹사이트 기능을 설치하지 않습니다. 카탈로그 선택 품목 화면은 카탈로그에서 전달한 품목이 있을 때 목록을 표시합니다.</p>
    </AppShell>
  );
}
