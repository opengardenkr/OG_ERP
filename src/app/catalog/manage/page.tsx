import { AppShell } from "@/components/app-shell";
import { CatalogManager } from "@/components/catalog-manager";
export default function Page() { return <AppShell title="품종 관리" subtitle="국내 라인업 · 새 품종은 비공개로 저장됩니다. 가격은 사내에서만 표시됩니다."><CatalogManager /></AppShell>; }
