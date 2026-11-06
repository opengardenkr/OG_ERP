import { AppShell } from "@/components/app-shell";
import { CatalogManager } from "@/components/catalog-manager";
export const metadata = { title: "품종 관리 | 오픈가든", robots: { index: false, follow: false } };
export default function Page() { return <AppShell title="품종 관리" subtitle="국내 라인업 품종 등록·수정 · 현장에서도 폰으로 바로 등록 · 새 품종은 비공개로 저장, 가격은 사내에서만 보입니다."><CatalogManager /></AppShell>; }
