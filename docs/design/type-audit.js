// OSLE Select — 글의 선 검사 (v2.5). 브랜드 화면 콘솔에서 실행.
// 완료 조건: mixed 0 (혼합 줄에서 자식 상자가 부모보다 큰 곳 없음) · inv의 줄 높이가 전부 16·20·24·28·36·48·64 중 하나.
(async () => {
  await document.fonts.ready;
  const m = {}; for (const f of ['Pretendard', 'SUIT']) { const c = document.createElement('canvas').getContext('2d'); c.font = `400 100px "${f}"`; const t = c.measureText('한글Hg0'); m[f] = { ascent: t.fontBoundingBoxAscent, descent: t.fontBoundingBoxDescent }; }
  const main = document.querySelector('main'); const ok = new Set([16, 20, 24, 28, 36, 48, 64]);
  const mixed = [], inv = {}, badLh = [];
  for (const el of main.querySelectorAll('*')) {
    const s = getComputedStyle(el); const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (hasText) { const lh = parseFloat(s.lineHeight); const k = `${s.fontSize}/${s.lineHeight}/${s.fontWeight}/${s.fontFamily.split(',')[0].replace(/"/g, '')}`; inv[k] = (inv[k] || 0) + 1; if (!ok.has(Math.round(lh)) && !el.closest('.btn,.chip,button,select')) badLh.push([k, (el.textContent || '').trim().slice(0, 12)]); }
    if (s.display === 'inline' && el.parentElement && getComputedStyle(el.parentElement).fontFamily !== s.fontFamily) { const r = el.getBoundingClientRect(), pr = el.parentElement.getBoundingClientRect(); if (r.height && (r.top < pr.top - 0.5 || r.bottom > pr.bottom + 0.5)) mixed.push([el.className, (el.textContent || '').trim().slice(0, 8), Math.round(r.top), Math.round(r.bottom), Math.round(pr.top), Math.round(pr.bottom)]); }
  }
  console.log('fonts', m); console.table(mixed); console.table(badLh.slice(0, 40)); console.log(inv);
  return { mixedCount: mixed.length, badLineHeights: badLh.length };
})();
