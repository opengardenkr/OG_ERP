"use client";
import { useMemo, useState } from "react";
import type { SalesMapItem } from "@/lib/airtable/sales-map";

type Position = { lat: number; lng: number };
function straightKm(a: Position,b: Position) {
  const toRad = (v:number) => v*Math.PI/180;
  const x=toRad(b.lat-a.lat), y=toRad(b.lng-a.lng);
  return 12742*Math.asin(Math.min(1,Math.sqrt(Math.sin(x/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(y/2)**2)));
}
export function SalesRoutePlanner({entries,positions,onFocus}:{
  entries:SalesMapItem[]; positions:Record<string,Position|null>; onFocus:(id:string)=>void;
}) {
  const [myLocation,setMyLocation]=useState<Position|null>(null);
  const [locationMessage,setLocationMessage]=useState("");
  const [search,setSearch]=useState("");
  const [stops,setStops]=useState<string[]>([]);
  const [message,setMessage]=useState("");
  const [nearby,setNearby]=useState(false);
  const candidates=useMemo(()=>{
    const selected=entries.filter(p=>p.address && [p.name,p.address,p.category].some(s=>s.toLowerCase().includes(search.trim().toLowerCase())));
    if(nearby && myLocation)selected.sort((a,b)=>(positions[a.id]?straightKm(myLocation,positions[a.id]!):Infinity)-(positions[b.id]?straightKm(myLocation,positions[b.id]!):Infinity));
    return selected;
  },[entries,search,nearby,myLocation,positions]);
  const route=stops.map(id=>entries.find(p=>p.id===id)).filter((p):p is SalesMapItem=>!!p);
  const locate=()=>{
    if(!navigator.geolocation){setLocationMessage("이 기기에서는 현재 위치를 확인할 수 없습니다.");return;}
    setLocationMessage("위치를 확인하는 중…");
    navigator.geolocation.getCurrentPosition(
      x=>{setMyLocation({lat:x.coords.latitude,lng:x.coords.longitude});setNearby(true);setLocationMessage("현재 위치를 확인했습니다. 좌표 확인된 장소만 거리순으로 정렬합니다.");},
      ()=>setLocationMessage("위치 권한을 허용하지 않아도 주소 검색과 루트 계획은 이용할 수 있습니다."),
      {enableHighAccuracy:false,timeout:10000,maximumAge:300000}
    );
  };
  const optimize=()=>{
    if(!myLocation){setMessage("먼저 내 주변 버튼으로 현재 위치를 확인해 주세요.");return;}
    let position=myLocation;
    const remaining=route.filter(p=>positions[p.id]), unlocated=route.filter(p=>!positions[p.id]).map(p=>p.id), sorted:string[]=[];
    while(remaining.length){
      remaining.sort((a,b)=>straightKm(position,positions[a.id]!)-straightKm(position,positions[b.id]!));
      const next=remaining.shift()!;
      sorted.push(next.id);position=positions[next.id]!;
    }
    setStops([...sorted,...unlocated]);
    setMessage("좌표가 있는 장소를 직선거리 기준으로 정렬했습니다. 차량 도로·교통량을 반영한 최적 경로는 아닙니다.");
  };
  const copy=async()=>{
    try{
      await navigator.clipboard.writeText(route.map((p,i)=>`${i+1}. ${p.name} | ${p.address}`).join("\n"));
      setMessage("방문 목록을 복사했습니다.");
    }catch{setMessage("복사가 차단됐습니다. 아래 방문 순서를 확인해 주세요.");}
  };
  const shift=(index:number,delta:number)=>{
    setStops(old=>{const next=[...old],j=index+delta;if(j<0||j>=next.length)return old;[next[index],next[j]]=[next[j],next[index]];return next;});
  };
  return <section className="rounded-lg border border-line bg-white p-3" aria-label="방문 영업 루트 계획">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">내 주변 영업 · 방문 루트</h2>
      <button type="button" className="btn text-sm" onClick={locate}>내 주변</button>
    </div>
    <p className="mt-1 text-xs text-muted">지도에서 업체·관공서를 표시한 뒤 이곳에서 방문 순서를 구성하세요. 현재 위치는 브라우저에서만 사용하며 서버에 저장하지 않습니다.</p>
    {locationMessage&&<p role="status" className="mt-2 text-xs text-muted">{locationMessage}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input aria-label="루트에 넣을 장소 검색" className="field min-w-0 flex-1" placeholder="회사명·지자체·주소" value={search} onChange={e=>setSearch(e.target.value)} />
      <button type="button" className="btn text-sm" disabled={!myLocation} aria-pressed={nearby} onClick={()=>setNearby(v=>!v)}>{nearby?"✓ 가까운 순":"가까운 순"}</button>
    </div>
    <div className="mt-2 max-h-44 overflow-auto rounded border border-line" role="list">
      {candidates.slice(0,40).map(p=><div role="listitem" key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2 py-2 text-sm">
        <button type="button" className="text-left font-semibold underline-offset-2 hover:underline" onClick={()=>onFocus(p.id)}>{p.name}<span className="block text-xs font-normal text-muted">{p.address}{myLocation&&positions[p.id]?` · 직선 ${straightKm(myLocation,positions[p.id]!).toFixed(1)}km`:""}</span></button>
        <button type="button" className="btn text-xs" disabled={stops.includes(p.id)} onClick={()=>setStops(old=>[...old,p.id])}>{stops.includes(p.id)?"추가됨":"+ 방문"}</button>
      </div>)}
      {!candidates.length&&<p className="p-3 text-sm text-muted">표시 중인 장소가 없습니다. 지도 필터를 확인하세요.</p>}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">방문 순서 · {route.length}곳</strong><div className="flex flex-wrap gap-2">
      <button type="button" className="btn text-xs" disabled={!myLocation||!route.length} onClick={optimize}>가까운 순 추천</button>
      <button type="button" className="btn text-xs" disabled={!route.length} onClick={copy}>순서 복사</button>
      <button type="button" className="btn text-xs" disabled={!route.length} onClick={()=>setStops([])}>초기화</button>
    </div></div>
    {message&&<p role="status" className="mt-2 text-xs text-muted">{message}</p>}
    <ol className="mt-2 space-y-2">
      {route.map((p,i)=><li key={p.id} className="flex flex-wrap items-center gap-2 rounded border border-line p-2 text-sm">
        <span className="font-semibold">{i+1}. {p.name}</span>
        <span className="min-w-0 flex-1 text-xs text-muted">{p.address}</span>
        <button type="button" className="btn text-xs" disabled={i===0} onClick={()=>shift(i,-1)} aria-label={`${p.name} 위로`}>↑</button>
        <button type="button" className="btn text-xs" disabled={i===route.length-1} onClick={()=>shift(i,1)} aria-label={`${p.name} 아래로`}>↓</button>
        <button type="button" className="btn text-xs" onClick={()=>setStops(old=>old.filter(id=>id!==p.id))}>제외</button>
        <a className="btn text-xs" href={`https://map.naver.com/p/search/${encodeURIComponent(p.address)}`} target="_blank" rel="noopener noreferrer">네이버 지도</a>
      </li>)}
      {!route.length&&<li className="p-2 text-sm text-muted">위 목록에서 방문할 장소를 추가해 주세요.</li>}
    </ol>
    <p className="mt-2 text-xs text-muted">※ 거리순은 단순 직선거리이며 길찾기·차량 소요시간·도로 접근성은 네이버 지도에서 별도로 확인해야 합니다.</p>
  </section>;
}
