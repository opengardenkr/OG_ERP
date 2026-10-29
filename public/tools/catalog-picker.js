(function(){
 const list=document.getElementById('catalog-list');
 const status=document.getElementById('catalog-status');
 const source=document.getElementById('catalog-source');
 const query=document.getElementById('catalog-search');
 const more=document.getElementById('catalog-more');
 const MAX=48;
 let catalog=[],visible=MAX;
 const clean=v=>String(v||'').normalize('NFKC').toLocaleLowerCase('ko').replace(/[\\s\\-_'’"“”·.,/]+/g,'');
 function getSelected(){
   try{return CatalogSelection.recall()}catch(e){status.textContent=e.message;return []}
 }
 function draw(){
   const selected=getSelected();
   document.getElementById('state').textContent=selected.length+'개 품목 선택됨 · 견적서·제안서에서 함께 사용';
   const body=document.getElementById('items');
   body.replaceChildren();
   selected.forEach((p,i)=>{
     const tr=document.createElement('tr');
     [p.kname,p.size,String(p.qty),p.plantCode].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});
     const td=document.createElement('td'),remove=document.createElement('button');
     remove.type='button';remove.textContent='빼기';
     remove.onclick=()=>{
       const next=selected.filter((_,j)=>j!==i);
       if(next.length)CatalogSelection.remember(next);else sessionStorage.removeItem('og_selection_v1');
       draw();
     };
     td.append(remove);tr.append(td);body.append(tr);
   });
 }
 function render(){
   const text=clean(query.value),supplier=source.value;
   const matches=catalog.filter(p=>(!supplier||p.source===supplier)&&clean([p.kname,p.sname,p.size,p.sku,p.source].flat().join(' ')).includes(text));
   status.textContent=matches.length+'개 항목 검색됨 · 현재 '+Math.min(matches.length,visible)+'개 표시 · 최대 20개 품목 선택';
   list.replaceChildren();
   const fragment=document.createDocumentFragment();
   matches.slice(0,visible).forEach(p=>{
     const card=document.createElement('div');card.style.cssText='border:1px solid #dfe5dc;padding:8px;min-width:0';
     if(p.image){const img=document.createElement('img');img.src=p.image;img.alt=p.kname||p.sname;img.loading='lazy';img.decoding='async';img.style.cssText='width:100%;aspect-ratio:1;object-fit:contain';card.append(img);}
     const title=document.createElement('strong');title.textContent=p.kname||p.sname||'이름 미입력';card.append(title);
     const label=document.createElement('div');label.style.cssText='font-size:12px;color:#637468';label.textContent=p.source||'';card.append(label);
     (Array.isArray(p.size)?p.size:[p.size]).filter(Boolean).forEach(size=>{
       const add=document.createElement('button');add.type='button';add.textContent=size+' 담기';
       add.style.cssText='font-size:12px;padding:6px;margin:4px';
       add.onclick=()=>{
         try{
           const chosen=getSelected();
           const current=chosen.find(x=>x.plantCode===p.id&&x.size===size);
           if(current)current.qty+=1;
           else chosen.push({kname:p.kname||p.sname,sname:p.sname,size,qty:1,plantCode:p.id,image:p.image});
           CatalogSelection.remember(chosen);draw();
         }catch(e){status.textContent=e.message;}
       };
       card.append(add);
     });
     fragment.append(card);
   });
   list.append(fragment);
   more.hidden=matches.length<=visible;
   more.textContent='다음 '+Math.min(MAX,matches.length-visible)+'개 보기';
 }
 query.addEventListener('input',()=>{visible=MAX;render()});
 source.addEventListener('change',()=>{visible=MAX;render()});
 more.addEventListener('click',()=>{visible+=MAX;render()});
 draw();
 fetch('/api/catalog/browse',{cache:'no-store'}).then(async r=>{
   const data=await r.json();if(!r.ok)throw Error(data.error||'카탈로그 연결 실패');
   catalog=data.items||[];render();
 }).catch(e=>{status.textContent=e.message;});
})();
