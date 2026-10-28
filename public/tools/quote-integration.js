(function(){
  function status(message,error){const el=document.getElementById('atStatus-history');if(el){el.textContent=message;el.className='sync-status '+(error?'err':'ok');}}
  async function changeDeleted(id,deleted){
    if(!/^rec[A-Za-z0-9]{14}$/.test(id))return;
    let reason='';
    if(deleted){reason=prompt('이 견적서를 목록에서 삭제할까요? 원본은 보존되며 [삭제 포함]에서 복원할 수 있습니다. 삭제 사유를 입력하세요.');if(reason===null)return;if(!reason.trim()||reason.length>500){status('삭제 사유를 500자 이내로 입력해주세요.',true);return;}}
    else if(!confirm('이 견적서를 복원할까요?'))return;
    status(deleted?'삭제하는 중…':'복원하는 중…');
    try{
      const response=await fetch('/api/quotes/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({deleted,reason})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'저장 실패');
      if(typeof window.runHistorySearch==='function')await window.runHistorySearch();
      status(deleted?'삭제했습니다. [삭제 포함]을 켜면 다시 보이며 복원할 수 있습니다.':'복원했습니다.');
    }catch(error){status(error.message||'저장하지 못했습니다.',true);}
  }
  window.addEventListener('load',()=>{
    window.deleteQuote=id=>changeDeleted(id,true);window.restoreQuote=id=>changeDeleted(id,false);
    const actions=document.querySelector('#mainPane-write .actions') || document.getElementById('itemBody')?.closest('.section');
    if(!actions)return;
    const box=document.createElement('div');box.style.cssText='padding:12px;border:1px solid #d3ddcf;background:#f5f8f2;margin:12px 0';
    const text=document.createElement('p');text.textContent='선택 품목을 견적서와 제안서에서 함께 사용합니다. 가격은 확인 후 입력해주세요.';
    const load=document.createElement('button');load.className='mini-btn';load.textContent='카탈로그 선택 품목 불러오기';load.type='button';
    const proposal=document.createElement('button');proposal.className='mini-btn';proposal.textContent='현재 품목으로 제안서';proposal.type='button';
    box.append(text,load,proposal);actions.before(box);
    const encoded=new URLSearchParams(location.search).get('og_selection');
    if(encoded){try{CatalogSelection.remember(CatalogSelection.decode(encoded));history.replaceState(null,'',location.pathname);}catch(error){text.textContent=error.message;}}
    load.onclick=()=>{
      try{
        const items=CatalogSelection.recall();if(!items.length){text.textContent='먼저 카탈로그에서 품목을 선택해주세요.';return;}
        const current=window.readForm();
        if(current.items?.some(p=>p.name)&&!confirm('현재 작성 중인 품목을 선택 품목으로 바꿀까요? 고객 정보는 유지됩니다.'))return;
        window.applyToForm({...current,kind:'plant',items:items.map(p=>({name:p.kname,spec:p.size,qty:p.qty,price:''}))});
        text.textContent=items.length+'개 품목을 불러왔습니다. 가격을 확인해주세요.';
      }catch(error){text.textContent='불러오기 실패: '+error.message;}
    };
    proposal.onclick=()=>{
      try{
        const selected=CatalogSelection.recall();
        const items=window.readForm().items.filter(p=>p.name&&p.spec).map(p=>{
          const linked=CatalogSelection.match({kname:p.name,size:p.spec},selected);
          return {...linked,kname:p.name,size:p.spec,qty:p.qty,sname:linked?.sname||'',plantCode:linked?.plantCode||'',image:linked?.image||''};
        });
        if(!items.length){text.textContent='품목명과 규격을 입력해주세요.';return;}
        CatalogSelection.remember(items);window.top.location.href='/proposal';
      }catch(error){text.textContent='제안서 연결 실패: '+error.message;}
    };
    // Make the existing recoverable deletion action visible without opening the overflow menu.
    const historyView=document.getElementById('histView');
    if(historyView)new MutationObserver(()=>{
      historyView.querySelectorAll('.row-menu').forEach(menu=>{
        if(menu.previousElementSibling?.classList.contains('quote-delete-visible'))return;
        const original=menu.querySelector('button[onclick^="deleteQuote"]');if(!original)return;
        const button=original.cloneNode(true);button.className='mini-btn quote-delete-visible';menu.before(button);
      });
    }).observe(historyView,{childList:true,subtree:true});
  });
})();
