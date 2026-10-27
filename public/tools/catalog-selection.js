(function(root){
  function safeImage(value){
    try{
      const u=new URL(value);
      const host=u.hostname==='open-garden.co.kr'||u.hostname==='opengarden-web.vercel.app'||u.hostname==='opengardenweb-git-codex-catalog-integration-20261027-opengarden.vercel.app'||/^opengarden-web-[a-z0-9-]+-opengarden\.vercel\.app$/.test(u.hostname);
      if(u.protocol!=='https:'||u.port||u.username||u.password||!host||u.pathname!=='/api/plant-image')return '';
      if(!['immediate','preorder'].includes(u.searchParams.get('group'))||!/^rec[A-Za-z0-9]{14}$/.test(u.searchParams.get('id')||''))return '';
      return u.href;
    }catch{return '';}
  }
  function decode(encoded){
    if(!encoded||encoded.length>7000||!/^[A-Za-z0-9_-]+$/.test(encoded))throw new Error('유효하지 않은 품목 목록');
    const raw=atob(encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4));
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));
    if(!data||data.version!==1||!Array.isArray(data.items)||data.items.length<1||data.items.length>20)throw new Error('1~20개 품목을 선택해주세요');
    return data.items.map(p=>{
      if(!p||typeof p.kname!=='string'||!p.kname.trim()||typeof p.size!=='string'||!p.size.trim())throw new Error('품목명과 규격을 확인해주세요');
      return {kname:p.kname.slice(0,100),sname:String(p.sname||'').slice(0,160),size:p.size.slice(0,40),
        qty:Number.isFinite(Number(p.qty))?Math.min(999999,Math.max(1,Math.floor(Number(p.qty)))):1,
        plantCode:String(p.plantCode||'').slice(0,100),image:safeImage(p.image)};
    });
  }
  const api={decode,safeImage};if(typeof module==='object')module.exports=api;else root.CatalogSelection=api;
})(typeof window==='object'?window:globalThis);
