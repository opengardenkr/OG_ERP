(function(){
 let catalog=[];const list=document.getElementById('catalog-list'),status=document.getElementById('catalog-status');
 const clean=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s/g,'');
 function render(){
 const query=clean(document.getElementById('catalog-search').value);list.replaceChildren();
 catalog.filter(p=>clean([p.kname,p.sname,p.size,p.sku].join(' ')).includes(query)).forEach(p=>{
  const card=document.createElement('div');card.style.cssText='border:1px solid #dfe5dc;padding:8px';
  if(p.image){const img=document.createElement('img');img.src=p.image;img.alt=p.kname||p.sname;img.loading='lazy';img.style.cssText='width:100%;aspect-ratio:1;object-fit:contain';card.append(img);}
  const title=document.createElement('strong');title.textContent=p.kname||p.sname;card.append(title);
  const sizes=Array.isArray(p.size)?p.size:[p.size];
  sizes.filter(Boolean).forEach(size=>{const add=document.createElement('button');add.textContent=size+' 담기';add.style.cssText='font-size:12px;padding:6px;margin:4px';add.onclick=()=>{
   try{const chosen=CatalogSelection.recall();const current=chosen.find(x=>x.plantCode===p.id&&x.size===size);if(current)current.qty+=1;else chosen.push({kname:p.kname||p.sname,sname:p.sname,size,qty:1,plantCode:p.id,image:p.image});CatalogSelection.remember(chosen);draw();}catch(e){status.textContent=e.message;}
  };card.append(add);});list.append(card);
 });
 }
 function draw(){
  const selected=CatalogSelection.recall();rows=selected.map(p=>({name:p.kname,size:p.size,qty:p.qty,code:p.plantCode}));
  document.getElementById('state').textContent=selected.length+'개 품목 선택됨 · 견적서·제안서에서 함께 사용';
  const body=document.getElementById('items');body.replaceChildren();
  selected.forEach((p,i)=>{const tr=document.createElement('tr');[p.kname,p.size,String(p.qty),p.plantCode].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});const td=document.createElement('td'),remove=document.createElement('button');remove.textContent='빼기';remove.onclick=()=>{const next=selected.filter((_,j)=>j!==i);if(next.length)CatalogSelection.remember(next);else sessionStorage.removeItem('og_selection_v1');draw();};td.append(remove);tr.append(td);body.append(tr);});
 }
 document.getElementById('catalog-search').addEventListener('input',render);
 try{draw();}catch(e){status.textContent=e.message;}
 fetch('/api/catalog/browse').then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);catalog=data.items;status.textContent=catalog.length+'개 품종 · 최대 20개 품목 선택';render();}).catch(e=>{status.textContent=e.message;});
})();
