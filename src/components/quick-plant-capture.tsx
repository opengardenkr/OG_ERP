"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Link from "next/link";
import { SIZES, MAX_PHOTO_BYTES } from "@/lib/catalog-input";
import type { ManagedPlant } from "@/lib/airtable/catalog-management";

type Candidate={pageId:number;title:string;preview:string;source:string;license:string;canImport:boolean};
export function QuickPlantCapture() {
  const [name,setName]=useState(""),[scientificName,setScientificName]=useState("");
  const [size,setSize]=useState(""),[price,setPrice]=useState(""),[notes,setNotes]=useState("");
  const [item,setItem]=useState<ManagedPlant|null>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [candidates,setCandidates]=useState<Candidate[]>([]),[searching,setSearching]=useState(false);
  const send=async(url:string,body:unknown)=>{
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||"저장하지 못했습니다.");
    return data;
  };
  const create=async()=>{
    setBusy(true);setError("");setMessage("");
    try{
      const input={name,scientificName,sizes:size?[size]:[],price:price===""?null:Number(price),summary:notes,visibility:"비공개"};
      const data=await send("/api/catalog/manage",{action:"save",input});
      setItem(data.item);setMessage("비공개 품종으로 저장했습니다. 이제 대표사진 또는 현장 사진을 붙일 수 있습니다.");
    }catch(e){setError(e instanceof Error?e.message:"저장 실패");}finally{setBusy(false);}
  };
  const upload=async(file:File|undefined)=>{
    if(!file||!item)return;
    if(file.size>MAX_PHOTO_BYTES){setError("사진은 2MB 이하로 압축해 주세요.");return;}
    setBusy(true);setError("");setMessage("");
    try{
      const form=new FormData();form.set("id",item.id);form.set("version",item.version);form.set("file",file);
      const response=await fetch("/api/catalog/manage",{method:"POST",body:form});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||"사진을 저장할 수 없습니다.");
      setItem(data.item);setMessage("사진을 추가했습니다. 첫 번째 사진이 대표사진입니다.");
    }catch(e){setError(e instanceof Error?e.message:"사진 업로드 실패");}finally{setBusy(false);}
  };
  const search=async()=>{
    const term=(scientificName||name).trim();
    if(term.length<2){setError("사진 검색을 위해 품종명 또는 학명을 입력해 주세요.");return;}
    setSearching(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/catalog/photo-candidates?q="+encodeURIComponent(term),{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||"검색할 수 없습니다.");
      setCandidates(data.candidates||[]);
      if(!data.candidates?.length)setMessage("검색된 사진이 없습니다. 정확한 학명이나 품종명을 입력하고 다시 찾아보세요.");
    }catch(e){setError(e instanceof Error?e.message:"검색 실패");}finally{setSearching(false);}
  };
  const chooseCandidate=async(candidate:Candidate)=>{
    if(!item||!candidate.canImport)return;
    if(!window.confirm("실제 등록할 품종과 사진 속 식물이 정확히 일치하는지 확인하셨나요? CC0 사진을 대표사진으로 등록합니다."))return;
    setBusy(true);setError("");setMessage("");
    try{
      const data=await send("/api/catalog/photo-candidates",{id:item.id,version:item.version,pageId:candidate.pageId});
      let latest=data.item as ManagedPlant;
      if(latest.photos.length>1){
        const added=latest.photos.find(p=>!item.photos.some(old=>old.id===p.id));
        if(added){
          try {
            const sorted=await send("/api/catalog/manage",{action:"photos",id:latest.id,version:latest.version,ids:[added.id,...latest.photos.filter(p=>p.id!==added.id).map(p=>p.id)]});
            latest=sorted.item;
          }catch{setMessage("사진은 저장됐지만 대표사진 순서 변경에 실패했습니다. 품종 관리에서 순서를 확인해 주세요.");}
        }
      }
      setItem(latest);
      setMessage(m=>m||"라이선스를 확인한 인터넷 사진을 대표사진으로 저장했습니다. 원본 출처는 후보 링크에서 확인할 수 있습니다.");
    }catch(e){setError(e instanceof Error?e.message:"사진 등록 실패");}finally{setBusy(false);}
  };
  const reset=()=>{setItem(null);setName("");setScientificName("");setSize("");setPrice("");setNotes("");setCandidates([]);setMessage("");setError("");};
  return <div className="mx-auto max-w-xl space-y-4 pb-16">
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-sm font-semibold">현장에서 1분 빠른등록</p>
      <p className="mt-1 text-xs text-muted">이름·규격·가격은 빈칸이어도 됩니다. 저장 즉시 비공개로 등록되어 고객 카탈로그에 자동 노출되지 않습니다.</p>
      {error&&<p role="alert" className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {message&&<p role="status" className="mt-3 rounded bg-green-50 p-2 text-sm text-green-800">{message}</p>}
      <fieldset disabled={busy||!!item} className="mt-4 space-y-4">
        <label className="block text-sm font-semibold">품종 이름<input className="field mt-1 w-full min-h-12" placeholder="예: 목수국 라임라이트" value={name} onChange={e=>setName(e.target.value)} maxLength={200}/></label>
        <label className="block text-sm font-semibold">해외 품종명·학명 (사진 동정용)<input className="field mt-1 w-full min-h-12" placeholder="예: Hydrangea paniculata 'Limelight'" value={scientificName} onChange={e=>setScientificName(e.target.value)} maxLength={200}/></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">규격<select className="field mt-1 w-full min-h-12" value={size} onChange={e=>setSize(e.target.value)}><option value="">미입력</option>{SIZES.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
          <label className="block text-sm font-semibold">가격 (원)<input type="number" min="0" className="field mt-1 w-full min-h-12" placeholder="미입력 가능" value={price} onChange={e=>setPrice(e.target.value)}/></label>
        </div>
        <label className="block text-sm font-semibold">현장 메모 · 최대 600자<textarea className="field mt-1 min-h-20 w-full" value={notes} onChange={e=>setNotes(e.target.value.slice(0,600))} placeholder="특징·개화시기·식재 팁을 간단히 기록하세요."/></label>
      </fieldset>
      {!item?<button type="button" disabled={busy} onClick={create} className="btn btn-primary mt-4 w-full min-h-12">{busy?"등록 중…":"비공개 품종 등록"}</button>:<div className="mt-4 flex items-center justify-between gap-2"><span className="text-xs text-muted">등록 ID · {item.id}</span><button type="button" className="btn" disabled={busy} onClick={reset}>다른 품종 등록</button></div>}
    </div>
    <div className="rounded-lg border border-line bg-white p-4">
      <h2 className="font-semibold">대표사진은 인터넷 후보에서 선택</h2>
      <p className="mt-1 text-xs text-muted">정확한 학명 우선으로 Wikimedia Commons를 검색합니다. 썸네일은 후보이며 실제 동일 품종인지 직접 확인해야 합니다. 자동 저장은 재사용 조건을 확인할 수 있는 CC0 사진만 허용합니다.</p>
      <button type="button" className="btn mt-3 min-h-11" onClick={search} disabled={searching||busy}>{searching?"검색 중…":"예쁜 대표사진 후보 찾기"}</button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {candidates.map(p=><article key={p.pageId} className="min-w-0 rounded border border-line p-2">
          <img src={p.preview} alt={p.title} loading="lazy" className="aspect-square w-full object-contain bg-canvas"/>
          <p className="mt-2 break-words text-xs font-medium">{p.title}</p>
          <p className="mt-1 text-xs text-muted">{p.license}</p>
          <a className="mt-2 block text-xs underline" href={p.source} target="_blank" rel="noopener noreferrer">원본·라이선스 보기</a>
          <button type="button" className="btn mt-2 w-full text-xs" disabled={!item||busy||!p.canImport||item.photos.length>=5} onClick={()=>chooseCandidate(p)}>{!p.canImport?"재사용 확인 필요":"대표사진 채택"}</button>
        </article>)}
      </div>
    </div>
    <div className="rounded-lg border border-line bg-white p-4">
      <h2 className="font-semibold">현장 실사진 · {item?.photos.length??0}/5장</h2>
      <p className="mt-1 text-xs text-muted">직접 촬영한 사진은 생육·현장 기록용으로 보관합니다. 대표사진 포함 최대 5장, 장당 2MB 이하입니다.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">{item?.photos.map((photo,i)=><div key={photo.id}><img className="aspect-square w-full object-contain" src={photo.url} alt={photo.filename}/><p className="text-xs">{i===0?"대표사진":`사진 ${i+1}`}</p></div>)}</div>
      <label className="mt-4 block rounded border border-dashed border-line p-3 text-center text-sm">사진 촬영 / 선택<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="mt-2 w-full text-xs" disabled={!item||busy||item.photos.length>=5} onChange={e=>{const file=e.target.files?.[0];e.target.value="";void upload(file);}} /></label>
      <p className="mt-2 text-xs text-muted">사진 순서 변경·삭제, 상세 설명 편집은 <Link className="underline" href="/catalog/manage">품종 관리</Link>에서 가능합니다.</p>
    </div>
  </div>;
}
