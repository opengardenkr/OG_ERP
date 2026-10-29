"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import type { SalesMapItem } from "@/lib/airtable/sales-map";
import { SalesRoutePlanner } from "@/components/sales-route-planner";

type Position = { lat: number; lng: number };
type Kind = "partner" | "government";

type Props = {
  entries: SalesMapItem[];
  naverMapClientId: string;
  warning: string;
};

// 다른 직원의 개인정보는 localStorage에 저장하지 않는다.
// 좌표만 세션 동안 캐시하여 목록·필터 이동 시 같은 요청을 반복하지 않도록 한다.
const CACHE_KEY = "og-sales-map-geocodes-v1";

function readCache(): Record<string, Position | null> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, Position | null>;
  } catch { /* 브라우저 스토리지 차단 시에도 계속 작동 */ }
  return {};
}
function saveCache(cache: Record<string, Position | null>) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* 무시 */ }
}
function getNaver(): any | undefined {
  return (window as any).naver;
}
let mapScriptPromise: Promise<void> | null = null;
function loadMapScript(id: string): Promise<void> {
  if (getNaver()?.maps?.Map && getNaver()?.maps?.Service) return Promise.resolve();
  if (mapScriptPromise) return mapScriptPromise;
  // 네이버 SDK의 callback은 geocoder 서브모듈까지 로드된 뒤 실행된다.
  mapScriptPromise = new Promise((resolve, reject) => {
    const callbackName = "OG_NAVER_MAPS_SALES_READY";
    const timer = window.setTimeout(() => reject(new Error("지도 응답 시간이 초과되었습니다")), 20000);
    (window as any)[callbackName] = () => {
      window.clearTimeout(timer);
      if (getNaver()?.maps?.Map && getNaver()?.maps?.Service) resolve();
      else reject(new Error("네이버 지도 Geocoding 기능을 찾을 수 없습니다"));
    };
    const script = document.createElement("script");
    script.dataset.ogNaverMap = "true";
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(id)}&submodules=geocoder&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => { window.clearTimeout(timer); reject(new Error("네이버 지도 SDK 로드 실패")); };
    document.head.appendChild(script);
  });
  mapScriptPromise = mapScriptPromise.catch((error) => { mapScriptPromise = null; throw error; });
  return mapScriptPromise;
}

function findLocation(query: string): Promise<Position | null> {
  return new Promise(resolve => {
    const sdk = getNaver()?.maps;
    if (!sdk?.Service?.geocode) { resolve(null); return; }
    sdk.Service.geocode({ query }, (status: unknown, response: any) => {
      if (status !== sdk.Service.Status.OK) { resolve(null); return; }
      const place = response?.v2?.addresses?.[0];
      const lat = Number(place?.y), lng = Number(place?.x);
      resolve(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
    });
  });
}

export function SalesMapClient({ entries, naverMapClientId, warning }: Props) {
  const [visibleKinds, setVisibleKinds] = useState<Record<Kind, boolean>>({ partner:true, government:true });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locations, setLocations] = useState<Record<string, Position | null>>({});
  const [busy, setBusy] = useState(false);
  const [mapProblem, setMapProblem] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const sdkMap = useRef<any>(null);
  const markers = useRef<any[]>([]);
  const [mapInitialized, setMapInitialized] = useState(false);

  const rows = useMemo(() => entries.filter(item => visibleKinds[item.kind]), [entries, visibleKinds]);
  const filtered = useMemo(() => rows.filter(item =>
    [item.name, item.address, item.detail, item.category].some(s => s.toLowerCase().includes(query.trim().toLowerCase()))
  ), [rows, query]);
  const selected = entries.find(item => item.id === selectedId);
  const known = rows.filter(item => locations[item.id] !== undefined && locations[item.id] !== null).length;
  const missing = rows.filter(item => !item.geocodeQuery).length;

  useEffect(() => {
    if (!naverMapClientId) return;
    let active = true;
    loadMapScript(naverMapClientId).then(() => {
      if (!active || !container.current) return;
      const naver = getNaver();
      if (!naver?.maps?.Service) {
        setMapProblem("네이버 지도 Geocoding 기능을 사용할 수 없습니다. Maps 서비스 설정을 확인해 주세요.");
        return;
      }
      if (!sdkMap.current) {
        sdkMap.current = new naver.maps.Map(container.current, {
          center: new naver.maps.LatLng(36.5, 127.8),
          zoom: 7,
          scaleControl: true,
          zoomControl: true,
          zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT },
        });
      }
      setMapInitialized(true);
    }).catch(e => { if (active) setMapProblem(e.message); });
    return () => { active = false; };
  }, [naverMapClientId]);

  // 지도 JS SDK가 도착한 후 현재 탭의 주소만 순차적으로 조회한다.
  // Geocoding 실패는 별도 표시하되 잘못된 위치를 임의로 찍지 않는다.
  useEffect(() => {
    if (!naverMapClientId || mapProblem) return;
    let cancelled = false;
    const run = async () => {
      await loadMapScript(naverMapClientId);
      if (cancelled) return;
      const cache = readCache();
      const next: Record<string, Position | null> = {};
      for (const item of rows) {
        if (item.geocodeQuery && Object.prototype.hasOwnProperty.call(cache, item.geocodeQuery)) {
          next[item.id] = cache[item.geocodeQuery];
        }
      }
      setLocations(previous => ({ ...previous, ...next }));
      const jobs = rows.filter(item => item.geocodeQuery && !Object.prototype.hasOwnProperty.call(cache, item.geocodeQuery));
      if (!jobs.length) return;
      setBusy(true);
      // 병렬 2개까지만. 실시간 데이터 조회 시 무분별한 API 호출 방지.
      let index = 0;
      const worker = async () => {
        while (!cancelled && index < jobs.length) {
          const item = jobs[index++];
          const pos = await findLocation(item.geocodeQuery);
          if (cancelled) return;
          cache[item.geocodeQuery] = pos;
          setLocations(previous => ({ ...previous, [item.id]: pos }));
          saveCache(cache);
          await new Promise(r => setTimeout(r, 250));
        }
      };
      await Promise.all([worker(), worker()]);
      if (!cancelled) setBusy(false);
    };
    run().catch(e => { if (!cancelled) { setMapProblem(String(e)); setBusy(false); } });
    return () => { cancelled = true; setBusy(false); };
  }, [rows, naverMapClientId, mapProblem]);

  // 필터가 바뀌어도 모든 좌표를 다시 요청하지 않고 마커만 재구성한다.
  useEffect(() => {
    if (!mapInitialized || !sdkMap.current) return;
    const naver = getNaver();
    if (!naver?.maps?.Marker) return;
    for (const marker of markers.current) marker.setMap(null);
    markers.current = [];
    for (const item of filtered) {
      const pos = locations[item.id];
      if (!pos) continue;
      const marker = new naver.maps.Marker({
        map: sdkMap.current,
        position: new naver.maps.LatLng(pos.lat, pos.lng),
        title: item.name,
        icon: { content: `<div style="width:17px;height:17px;border:3px solid white;border-radius:50%;background:${item.kind === "partner" ? "#168b55" : "#336ac9"};box-shadow:0 1px 5px #0005"></div>`, anchor: new naver.maps.Point(8, 8) },
      });
      naver.maps.Event.addListener(marker, "click", () => setSelectedId(item.id));
      markers.current.push(marker);
    }
  }, [filtered, locations, mapInitialized]);

  useEffect(() => {
    if (!selected || !sdkMap.current || !locations[selected.id]) return;
    const pos = locations[selected.id]!;
    const naver = getNaver();
    sdkMap.current.panTo(new naver.maps.LatLng(pos.lat, pos.lng));
  }, [selected, locations]);

  const groupCount = (wanted: Kind) => entries.filter(item => item.kind === wanted).length;
  const mapReady = !!naverMapClientId && !mapProblem && mapInitialized;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" aria-label="지도 표시 대상">
        <button type="button" className="btn text-sm" onClick={() => setVisibleKinds({partner:true,government:true})}>전체 표시 ({entries.length})</button>
        <button type="button" className="btn text-sm" onClick={() => setVisibleKinds({partner:false,government:false})}>모두 숨기기</button>
        <button type="button" aria-pressed={visibleKinds.partner} onClick={() => setVisibleKinds(v=>({...v,partner:!v.partner}))} className={`btn text-sm ${visibleKinds.partner ? "border-green-600 bg-green-50 font-semibold" : ""}`}>{visibleKinds.partner ? "✓ " : "+ "}업체 ({groupCount("partner")})</button>
        <button type="button" aria-pressed={visibleKinds.government} onClick={() => setVisibleKinds(v=>({...v,government:!v.government}))} className={`btn text-sm ${visibleKinds.government ? "border-blue-600 bg-blue-50 font-semibold" : ""}`}>{visibleKinds.government ? "✓ " : "+ "}관공서 ({groupCount("government")})</button>
      </div>
      {warning && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>}
      {mapProblem && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{mapProblem}</p>}
      {!naverMapClientId && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">지도 API 키가 설정되지 않았습니다. NAVER_MAPS_CLIENT_ID 환경변수와 네이버 클라우드의 등록 도메인을 확인해 주세요. 아래 목록은 이용할 수 있습니다.</p>}
      <div className="grid min-h-[calc(100dvh-220px)] gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="order-2 flex min-h-[280px] flex-col overflow-hidden rounded-lg border border-line bg-white">
          <div className="border-b border-line p-3">
            <label className="mb-1 block text-xs font-semibold" htmlFor="sales-map-search">거래처·지역 검색</label>
            <input id="sales-map-search" className="w-full rounded border border-line px-3 py-2 text-sm" placeholder="회사 이름, 지역, 업무 종류" value={query} onChange={e => setQuery(e.target.value)} />
            <div className="mt-2 flex justify-between text-xs text-muted"><span>{filtered.length}개 기록 · 지도 확인 {known}개</span><span>{busy ? "좌표 확인 중…" : missing ? `주소 없음 ${missing}개` : ""}</span></div>
          </div>
          <div className="max-h-[480px] flex-1 overflow-auto" role="list">
            {filtered.map(item => (
              <button role="listitem" key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`block w-full border-b border-line px-3 py-3 text-left hover:bg-canvas ${selectedId === item.id ? "bg-green-50" : ""}`}>
                <span className="block text-sm font-semibold">{item.name}</span>
                <span className="mt-1 block text-xs text-muted">{item.category} · {item.address || "주소 확인 필요"}</span>
                {item.approximate && <span className="mt-1 block text-xs text-amber-700">상세 주소 미확인 · 지도 핀 제외</span>}
              </button>
            ))}
            {!filtered.length && <p className="p-3 text-sm text-muted">해당하는 기록이 없습니다.</p>}
          </div>
        </div>
        <div className="order-1 flex min-h-[55dvh] flex-col overflow-hidden rounded-lg border border-line bg-white">
          <div className="relative min-h-[330px] flex-1">
            <div ref={container} className="absolute inset-0" aria-label="네이버 지도" />
            {!mapReady && <div className="absolute inset-0 flex items-center justify-center bg-canvas text-center text-sm text-muted">네이버 지도 인증 후 이곳에 거래처와 지자체 위치가 표시됩니다.</div>}
          </div>
          {selected ? <div className="border-t border-line p-3 text-sm">
            <div className="flex items-center justify-between gap-2"><strong>{selected.name}</strong><span className="text-xs text-muted">{selected.category}</span></div>
            <p className="mt-1 text-muted">{selected.address || "주소 미등록"}{selected.approximate ? " (대략 위치)" : ""}</p>
            {selected.contact && <p className="mt-1">담당자·연락처: {selected.contact}</p>}
            {selected.kind === "government" && selected.lastVisit && <p className="mt-1">방문일: {selected.lastVisit}</p>}
            {selected.kind === "partner" && <p className="mt-1">연결된 영업 기록: {selected.activityCount}건</p>}
            {selected.notes && <p className="mt-1 whitespace-pre-wrap text-muted">{selected.notes}</p>}
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <a className="text-green-700 underline" href={`https://airtable.com/appzLstFHtHcQlWSu/${selected.kind === "partner" ? "tblTGohUQYwkdLjpV" : "tblIkbVaxbApkV0oe"}/${selected.id}`} target="_blank" rel="noopener noreferrer">Airtable 기록 열기 ↗</a>
              {selected.address && <a className="text-green-700 underline" href={`https://map.naver.com/p/search/${encodeURIComponent(selected.address)}`} target="_blank" rel="noopener noreferrer">네이버에서 위치 확인 ↗</a>}
            </div>
          </div> : <p className="border-t border-line p-3 text-xs text-muted">목록에서 기록이나 지도 핀을 선택해 자세한 정보를 확인하세요.</p>}
        </div>
      </div>
      <SalesRoutePlanner entries={rows} positions={locations} onFocus={setSelectedId} />
      <p className="text-xs text-muted">주소가 없거나 검색되지 않은 기록은 지도에 억지로 표시하지 않습니다. 관공서의 관할 지역만 있고 상세 주소가 없으면 핀을 표시하지 않습니다. 위치 확인 결과는 직원의 브라우저 세션에만 보관됩니다.</p>
    </div>
  );
}
