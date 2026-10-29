import { AppShell } from "@/components/app-shell";
import { QuickPlantCapture } from "@/components/quick-plant-capture";
export const metadata={title:"현장 품종 빠른등록 | 오픈가든",robots:{index:false,follow:false}};
export default function Page(){return <AppShell title="현장 품종 빠른등록" subtitle="농장에서 휴대폰으로 이름·규격·가격·사진을 바로 기록합니다."><QuickPlantCapture /></AppShell>;}
