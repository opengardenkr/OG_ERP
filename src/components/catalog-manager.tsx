"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import { SIZES, MAX_PHOTO_BYTES, type CatalogInput } from "@/lib/catalog-input";
import type { ManagedPlant } from "@/lib/airtable/catalog-management";
const empty: CatalogInput = { name:"", scientificName:"", sizes:[], price:null, summary:"", visibility:"비공개" };
type Candidate = { pageId:number; title:string; preview:string; source:string; license:string; canImport:boolean };
/**
 * 품종 등록·수정 한 화면. 옛 '현장 빠른등록'(2026-11-06 통합)의 인터넷 사진 후보 찾기와 카메라 촬영을 여기로 옮겼다.
 * 폰에서는 입력 칸이 먼저, 목록이 아래에 온다.
 */
export function CatalogManager() {
 const [items,setItems] = useState<ManagedPlant[]>([]), [selected,setSelected] = useState<ManagedPlant|null>(null);
 const [draft,setDraft] = useState<CatalogInput>(empty), [query,setQuery] = useState(""), [busy,setBusy] = useState(false), [loading,setLoading] = useState(true), [error,setError] = useState(""), [notice,setNotice] = useState("");
 const [candidates,setCandidates] = useState<Candidate[]>([]), [searching,setSearching] = useState(false);
 const load = useCallback(async()=> { setLoading(true); setError(""); try {const r=await fetch("/api/catalog/manage"); const d=await r.json(); if(!r.ok) throw Error(d.error); setItems(d.items);} catch(e){setError(e instanceof Error?e.message:"조회 실패");} finally{setLoading(false);} },[]);
 useEffect(()=>{let active=true;fetch("/api/catalog/manage").then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(active)setItems(d.items);}).catch(e=>{if(active)setError(e instanceof Error?e.message:"조회 실패");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 function choose(item:ManagedPlant|null) { if (busy) return; if (JSON.stringify(draft)!==JSON.stringify(selected ? {name:selected.name,scientificName:selected.scientificName,sizes:selected.sizes,price:selected.price,summary:selected.summary,visibility:selected.visibility}:empty) && !confirm("저장하지 않은 입력을 닫고 이동할까요?")) return; setSelected(item); setDraft(item ? {name:item.name,scientificName:item.scientificName,sizes:item.sizes,price:item.price,summary:item.summary,visibility:item.visibility}:empty);setNotice("");setError("");setCandidates([]); }
 async function submit(body: unknown, form=false) {
  setBusy(true);setError("");setNotice("");
  try {const r=await fetch("/api/catalog/manage",{method:"POST",headers:form?undefined:{"Content-Type":"application/json"},body:form?body as FormData:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);const item=d.item as ManagedPlant;setSelected(item);setDraft({name:item.name,scientificName:item.scientificName,sizes:item.sizes,price:item.price,summary:item.summary,visibility:item.visibility});setItems(old=>[item,...old.filter(p=>p.id!==item.id)]);setNotice("저장했습니다. 공개 카탈로그 반영에는 캐시 갱신 시간이 걸릴 수 있습니다.");}
  catch(e){setError(e instanceof Error?e.message:"저장 실패");}finally{setBusy(false);}
 }
 async function order(ids:string[]) {if(selected) await submit({action:"photos",id:selected.id,version:selected.version,ids});}
 async function search() {
  const term=(draft.scientificName||draft.name).trim();
  if(term.length<2){setError("사진을 찾으려면 이름이나 학명을 먼저 입력해 주세요.");return;}
  setSearching(true);setError("");setNotice("");
  try{const r=await fetch("/api/catalog/photo-candidates?q="+encodeURIComponent(term),{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"검색할 수 없습니다.");setCandidates(d.candidates||[]);if(!d.candidates?.length)setNotice("찾은 사진이 없습니다. 정확한 학명·품종명으로 다시 찾아보세요.");}
  catch(e){setError(e instanceof Error?e.message:"검색 실패");}finally{setSearching(false);}
 }
 async function adopt(c:Candidate) {
  if(!selected||!c.canImport)return;
  if(!confirm("사진 속 식물이 이 품종과 정확히 같은지 확인하셨나요? CC0 사진을 대표사진으로 등록합니다."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/catalog/photo-candidates",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:selected.id,version:selected.version,pageId:c.pageId})});
   const d=await r.json();if(!r.ok)throw Error(d.error||"사진 등록 실패");
   let item=d.item as ManagedPlant;
   const added=item.photos.find(p=>!selected.photos.some(o=>o.id===p.id));
   if(added&&item.photos.length>1){const s=await fetch("/api/catalog/manage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"photos",id:item.id,version:item.version,ids:[added.id,...item.photos.filter(p=>p.id!==added.id).map(p=>p.id)]})});const sd=await s.json();if(s.ok)item=sd.item;}
   setSelected(item);setItems(old=>[item,...old.filter(p=>p.id!==item.id)]);setNotice("대표사진으로 등록했습니다. 출처는 후보의 원본 링크에서 확인할 수 있습니다.");
  }catch(e){setError(e instanceof Error?e.message:"사진 등록 실패");}finally{setBusy(false);}
 }
 return <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
  <aside className="card order-2 p-3 lg:order-1"><button className="btn btn-primary w-full" onClick={()=>choose(null)} disabled={busy}>새 품종 등록</button><label className="mt-3 block text-xs" htmlFor="plant-search">품종 검색</label><input id="plant-search" className="field mt-1 w-full" value={query} onChange={e=>setQuery(e.target.value)} /><button className="btn mt-2" disabled={busy||loading} onClick={load}>목록 새로고침</button>{loading?<p role="status" className="mt-3 text-sm">불러오는 중…</p>:<div className="mt-3 max-h-[65vh] overflow-auto">{items.filter(p=>`${p.name} ${p.scientificName} ${p.id}`.toLowerCase().includes(query.toLowerCase())).map(p=><button key={p.id} disabled={busy} onClick={()=>choose(p)} className={`block w-full border-b border-line p-2 text-left text-sm ${selected?.id===p.id?"bg-brand-50":""}`}>{p.name||p.scientificName||"이름 미입력"}<span className="block text-xs text-muted">{p.visibility||"기존 공개설정"} · {p.id.slice(-6)}</span></button>)}{!items.length&&<p className="text-sm text-muted">등록된 품종이 없거나 조회하지 못했습니다.</p>}</div>}</aside>
  <section className="card order-1 space-y-4 p-4 lg:order-2"><h2 className="font-semibold">{selected?"품종 수정":"새 품종"}</h2><p className="text-xs text-muted">이름·규격·가격은 빈칸으로 저장할 수 있습니다. 시스템 식별자는 자동 발급됩니다.</p>{selected&&<p className="text-xs text-muted">식별자 {selected.id}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-brand-600">{notice}</p>}
  <form onSubmit={e=>{e.preventDefault();void submit({action:"save",id:selected?.id,version:selected?.version,input:draft});}} className="space-y-3">
   <fieldset disabled={busy} className="space-y-3">
   <label className="block text-sm">이름<input className="field mt-1 w-full" maxLength={200} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label className="block text-sm">학명·품종명 (확인된 경우)<input className="field mt-1 w-full" maxLength={200} value={draft.scientificName} onChange={e=>setDraft({...draft,scientificName:e.target.value})}/></label>
   <div><span className="text-sm">규격 (선택)</span><div className="mt-1 flex flex-wrap gap-3">{[...new Set([...SIZES,...draft.sizes])].map(s=><label key={s} className="text-sm"><input type="checkbox" checked={draft.sizes.includes(s)} onChange={e=>setDraft({...draft,sizes:e.target.checked?[...draft.sizes,s]:draft.sizes.filter(x=>x!==s)})}/> {s}</label>)}</div></div>
   <label className="block text-sm">도매가 (원, 사내 전용)<input type="number" min="0" max="1000000000000" className="field mt-1 w-full" value={draft.price??""} onChange={e=>setDraft({...draft,price:e.target.value===""?null:Number(e.target.value)})}/></label>
   <label className="block text-sm">상세 요약 · {Array.from(draft.summary).length}/600자<textarea className="field mt-1 min-h-40 w-full" value={draft.summary} onChange={e=>setDraft({...draft,summary:e.target.value})} placeholder={'핵심특징:\n개화 시기:\nUSDA Zone:\n추천 식재 시기:\n관리 난이도:\n태그:'}/></label><p className="text-xs text-muted">확인되지 않은 값은 비워 두세요. 기존 설명이 600자를 넘으면 직접 줄인 뒤 저장합니다. 온도를 USDA Zone으로 환산하지 않습니다.</p>
   {selected&&<label className="block text-sm">공개 상태<select className="field ml-2" value={draft.visibility} onChange={e=>setDraft({...draft,visibility:e.target.value})}><option value="">기존 설정 유지</option><option>비공개</option><option>미검토</option><option>공개</option></select></label>}
   <button className="btn btn-primary" disabled={Array.from(draft.summary).length>600}>{busy?"저장 중…":selected?"변경 저장":"비공개로 등록"}</button>
   </fieldset>
  </form>
  <div className="border-t border-line pt-4"><h3 className="text-sm font-semibold">사진 · {selected?.photos.length||0}/5장</h3><p className="mt-1 text-xs text-muted">첫 번째 사진이 대표사진입니다. 폰에서는 바로 촬영할 수 있습니다. JPG·PNG·WebP 2MB 이하, 먼저 품종을 저장하면 올릴 수 있습니다.</p>
  <div className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{selected?.photos.map((p,i)=><div key={p.id} className="rounded border border-line p-2"><img src={p.url} alt={p.filename} className="aspect-square w-full object-contain"/><span className="text-xs">{i===0?"대표사진":`사진 ${i+1}`}</span><div className="mt-1 flex flex-wrap gap-1"><button className="btn text-xs" disabled={busy||i===0} onClick={()=>{const ids=selected.photos.map(p=>p.id);[ids[i-1],ids[i]]=[ids[i],ids[i-1]];void order(ids);}}>앞으로</button><button className="btn text-xs" disabled={busy||i===selected.photos.length-1} onClick={()=>{const ids=selected.photos.map(p=>p.id);[ids[i+1],ids[i]]=[ids[i],ids[i+1]];void order(ids);}}>뒤로</button><button className="btn text-xs" disabled={busy} onClick={()=>{if(confirm("이 사진을 목록에서 제거할까요? 원본 파일을 보관했는지 확인해 주세요."))void order(selected.photos.filter(x=>x.id!==p.id).map(x=>x.id));}}>제거</button></div></div>)}</div>
  <label className="block rounded border border-dashed border-line p-3 text-sm">사진 촬영 / 선택<input className="mt-2 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!selected||selected.photos.length>=5} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(!f||!selected)return;if(f.size>MAX_PHOTO_BYTES){setError("사진은 2MB 이하로 압축해 주세요.");return;}const form=new FormData();form.set("file",f);form.set("id",selected.id);form.set("version",selected.version);void submit(form,true);}}/></label>
  </div><div className="border-t border-line pt-3"><h3 className="text-sm font-semibold">인터넷 대표사진 후보</h3><p className="mt-1 text-xs text-muted">학명 우선으로 Wikimedia Commons를 찾습니다. 같은 품종인지 직접 확인하고 고르세요. 재사용 조건이 확인되는 CC0 사진만 등록됩니다.</p>
  <button type="button" className="btn mt-2" onClick={search} disabled={searching||busy}>{searching?"찾는 중…":"사진 후보 찾기"}</button>
  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{candidates.map(c=><article key={c.pageId} className="min-w-0 rounded border border-line p-2"><img src={c.preview} alt={c.title} loading="lazy" className="aspect-square w-full bg-canvas object-contain"/><p className="mt-1 break-words text-xs font-medium">{c.title}</p><p className="text-xs text-muted">{c.license}</p><a className="block text-xs underline" href={c.source} target="_blank" rel="noopener noreferrer">원본·라이선스</a><button type="button" className="btn mt-1 w-full text-xs" disabled={!selected||busy||!c.canImport||(selected?.photos.length||0)>=5} onClick={()=>adopt(c)}>{!c.canImport?"재사용 확인 필요":!selected?"먼저 저장":"대표사진으로"}</button></article>)}</div></div>
  </section>
 </div>;
}
