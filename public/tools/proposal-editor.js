/* Content edits apply to the same DOM used by browser print/PDF. No source records are changed. */
(function () {
  const panel = document.getElementById('panel');
  const note = document.createElement('div'); note.className = 'simple-note';
  note.innerHTML = '<b>고정 서식</b> 로고 · 헤더 · 기본 배치<br><b>수정 가능</b> 카드 제목 · 품종명 · 설명을 바로 클릭하세요. 사진은 클릭하여 교체, 화살표로 순서 변경, ×로 숨깁니다.<br><a href="/catalog" target="_top">카탈로그에서 품목 선택</a> · <a href="/quote" target="_top">같은 품목으로 견적서</a>';
  panel.insertBefore(note, panel.querySelector('section'));
  [...panel.querySelectorAll(':scope > section')].forEach(section => {
    const title = section.querySelector('h2')?.textContent;
    if (['데이터 입력','필터 & 이미지','폰트 크기 (pt)','제외한 카드'].includes(title)) {
      const details = document.createElement('details'); const summary = document.createElement('summary');
      summary.textContent = title === '데이터 입력' ? '고급: CSV 데이터 입력' : title;
      section.before(details);details.append(summary,section);
    }
  });
  // Manual credentials and automatic unverified web pictures are not part of the supported flow.
  document.getElementById('tabApiBtn').hidden = true;
  document.getElementById('webImg').checked = false;
  document.getElementById('webImg').closest('.field').hidden = true;
  document.getElementById('rate').closest('.field').hidden = true;
  document.getElementById('pages').addEventListener('input', event => {
    const field = event.target.closest('[data-edit]'); if (!field) return;
    const key = field.closest('.card').dataset.cardkey;
    const limit = field.dataset.edit === 'description' ? 120 : 100;
    const value = [...field.textContent].slice(0,limit).join('');
    if (field.textContent !== value) field.textContent = value;
    cardEdits.set(key, {...cardEdits.get(key), [field.dataset.edit]:value});
  });
  document.getElementById('pages').addEventListener('click', event => {
    const button = event.target.closest('[data-order]');if (!button) return;
    const key = button.closest('.card').dataset.cardkey;
    const group = groups.find(g => g.cardKeys.includes(key));if (!group) return;
    const i = group.cardKeys.indexOf(key), next = i + Number(button.dataset.order);
    if (next < 0 || next >= group.cardKeys.length) return;
    [group.cardKeys[i],group.cardKeys[next]]=[group.cardKeys[next],group.cardKeys[i]];render();
  });
  document.getElementById('pages').addEventListener('dragstart',event=>{
    if(event.target.closest('[contenteditable]'))event.preventDefault();
  });
  render();
})();
