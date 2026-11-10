import { ProgramIcon } from "@/components/program-icon";
import { ProgramPreview } from "@/components/program-preview";
import { EmptyState, ErrorState } from "@/components/data-state";
import type { Program } from "@/lib/airtable/programs";
import type { Result } from "@/lib/result";

export function ProgramCards({ result, showPreviews = false }: { result: Result<Program[]>; showPreviews?: boolean }) {
  if (!result.ok) return <ErrorState message={result.message} />;
  if (result.data.length === 0) {
    return (
      <EmptyState message="표시할 프로그램이 없다. Airtable 프로그램 테이블에서 사용여부를 확인해라." />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {result.data.map((program) => (
        <li key={program.id}>
          <a
            href={program.href}
            target={program.newTab ? "_blank" : undefined}
            rel={program.newTab ? "noreferrer" : undefined}
            className="card flex h-full flex-col overflow-hidden transition hover:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {showPreviews ? (
              <ProgramPreview src={program.previewImage} name={program.name} icon={program.icon} />
            ) : null}
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center gap-2">
                <ProgramIcon name={program.icon} />
                <span className="font-medium">{program.name}</span>
              </div>
              {program.description ? (
                <p className="mt-2 text-sm text-muted">{program.description}</p>
              ) : null}
              <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-faint">
                <span>{program.category}</span>
                {showPreviews ? <span>사이트 열기 {program.newTab ? "↗" : "→"}</span> : null}
              </div>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
