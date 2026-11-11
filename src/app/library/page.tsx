import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/data-state";
import { LibraryDelete } from "@/components/library-delete";
import { LibraryThumb } from "@/components/library-thumb";
import { LibraryUpload } from "@/components/library-upload";
import { getLibrary, type LibraryCategory } from "@/lib/airtable/library";

export const metadata = {
  title: "자료실 | 오픈가든",
  robots: { index: false, follow: false },
};

/** docs/design.md 분류 칩 색. */
const CHIP: Record<LibraryCategory, string> = {
  영업: "bg-purple-50 text-purple-700",
  수입: "bg-blue-50 text-blue-700",
  시공: "bg-teal-50 text-teal-700",
  자재: "bg-orange-50 text-orange-700",
  내부: "bg-canvas text-muted",
};

async function LibraryGrid() {
  const result = await getLibrary();
  if (!result.ok) return <ErrorState message={result.message} />;
  if (result.data.length === 0) {
    return <EmptyState message="아직 올린 자료가 없다. [자료 올리기]로 첫 자료를 올려라." />;
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {result.data.map((item) => (
        <li key={item.id} className="card flex flex-col overflow-hidden">
          {/* 작은 박스: 1쪽 미리보기 */}
          <a
            href={item.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="flex aspect-[3/4] items-center justify-center bg-canvas p-3"
            aria-label={`${item.title} 열기`}
          >
            <LibraryThumb src={item.thumbUrl} fileName={item.fileName} />
          </a>
          {/* 아래 배너: 제목 */}
          <div className="flex flex-1 flex-col gap-1 border-t border-line p-3">
            <div className="flex items-start justify-between gap-2">
              <a href={item.fileUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold leading-snug text-ink hover:underline">
                {item.title}
              </a>
              <span className={`chip shrink-0 ${CHIP[item.category]}`}>{item.category}</span>
            </div>
            {item.description ? <p className="text-xs leading-snug text-muted">{item.description}</p> : null}
            <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-faint">
              <span>{item.date}{item.author ? ` · ${item.author}` : ""}</span>
              <span className="flex items-center gap-2">
                <a href={item.fileUrl} download={item.fileName} className="text-muted hover:text-ink">다운로드</a>
                <LibraryDelete id={item.id} title={item.title} />
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function LibraryPage() {
  return (
    <AppShell
      title="자료실"
      subtitle="인쇄해서 쓰는 상담 시트·양식. 카드를 누르면 파일이 열린다."
      action={<LibraryUpload />}
    >
      <Suspense fallback={<p role="status" className="card p-4 text-sm text-muted">자료를 불러오는 중…</p>}>
        <LibraryGrid />
      </Suspense>
    </AppShell>
  );
}
