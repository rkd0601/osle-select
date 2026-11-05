// OSLE Select — 선·라인 검사 (v2.4, Cowork 2026-11-05)
// 브랜드 화면 콘솔에 붙여 넣고 실행. 완료 조건: bad 0 · off 0 · head의 밑선이 전부 같은 값 · doubles 0.
// grid-audit.js(블록 모서리)와 함께 돌린다. 1280 폭 기준 선: 73·168·264·359·454·550·645·740·836·931·1026·1122(스크롤바 있을 때).
(() => {
  const main = document.querySelector('main'); const wrap = main.getBoundingClientRect(); const cs = getComputedStyle(main);
  const L = Math.round(wrap.left + parseFloat(cs.paddingLeft)), R = Math.round(wrap.right - parseFloat(cs.paddingRight));
  const col = ((R - L) - 11 * 24) / 12;
  const lines = [...Array(12)].map((_, i) => Math.round(L + i * (col + 24))); const rights = lines.map(x => Math.round(x + col));
  const onLine = x => lines.some(l => Math.abs(l - x) <= 2) || rights.some(l => Math.abs(l - x) <= 2);
  const sy = window.scrollY; const tag = el => el.tagName + '.' + [...el.classList].slice(0, 3).join('.') + '|' + (el.textContent || '').trim().slice(0, 10);
  const out = { L, R, col: Math.round(col), lines, bad: [], off: [], doubles: [], head: null, columnTops: [] };
  // 1) 룰(border-top/bottom)의 양 끝은 선 위 — 작은 링크 밑줄·칩·sm 버튼·2열 표 안쪽 셀은 제외
  const rules = [];
  for (const el of main.querySelectorAll('*')) {
    if (el.matches('a, .chip, .btn.sm, .invoice td, .invoice th, .figure td, .figure th, dd, dt')) continue;
    const s = getComputedStyle(el); const r = el.getBoundingClientRect(); if (r.width < 40 || r.height === 0) continue;
    const bt = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none', bb = parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle !== 'none';
    if (bt) rules.push({ y: Math.round(r.top + sy), l: Math.round(r.left), r: Math.round(r.right), tag: tag(el) });
    if (bb) rules.push({ y: Math.round(r.bottom + sy), l: Math.round(r.left), r: Math.round(r.right), tag: tag(el) });
  }
  for (const q of rules) if (!onLine(q.l) || !onLine(q.r)) out.bad.push([q.tag, q.l, q.r, q.y]);
  // 2) 14px 안에 겹치는 룰(섹션 머리 밑줄 + 바로 아래 블록 윗줄 같은 것)
  rules.sort((a, b) => a.y - b.y);
  for (let i = 1; i < rules.length; i++) { const d = rules[i].y - rules[i - 1].y; if (d > 0 && d <= 14 && rules[i].tag !== rules[i - 1].tag && Math.max(rules[i].l, rules[i - 1].l) < Math.min(rules[i].r, rules[i - 1].r)) out.doubles.push([rules[i - 1].tag, rules[i - 1].y, rules[i].tag, rules[i].y]); }
  // 3) 썸네일 옆 글·선택지 글·타임라인 내용·소그리드 칸·입력·큰 버튼의 왼쪽은 선 위
  for (const el of main.querySelectorAll('.g12 > *, .todo .txt, .nowblock .txt, .nowblock > div, .kv > div, .grid3 > *, .tl .what, .choice .t, .choice input, .src-col, .rail, .invoice, .btn:not(.sm), input, select, textarea, .thumb, img')) {
    const r = el.getBoundingClientRect(); if (r.width < 10 || r.height === 0) continue; const l = Math.round(r.left);
    if (!onLine(l)) out.off.push([tag(el), l, Math.round(r.right), Math.round(r.top + sy)]);
  }
  // 4) 머리 행: H1 밑선 = 오른쪽 버튼·링크 밑선
  const h1 = main.querySelector('h1');
  if (h1) { const hr = h1.getBoundingClientRect(); const row = [...main.querySelectorAll('.g12 > .c4 .btn, .g12 > .c4 a, .g12 > .c4 button')].filter(e => Math.abs(e.getBoundingClientRect().top - hr.top) < 60).map(e => Math.round(e.getBoundingClientRect().bottom + sy)); out.head = { h1Bottom: Math.round(hr.bottom + sy), rightBottoms: row }; }
  // 5) 같은 행의 왼쪽 8칸 / 오른쪽 4칸 첫 룰 y
  const kids = [...main.querySelectorAll('.g12 > *')];
  for (let i = 1; i < kids.length; i++) { const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect(); if (Math.abs(a.top - b.top) < 1 || (a.right <= b.left && Math.abs(a.top - b.top) <= 4)) continue; if (a.right <= b.left && a.top !== b.top) out.columnTops.push([tag(kids[i - 1]), Math.round(a.top + sy), tag(kids[i]), Math.round(b.top + sy)]); }
  out.bad = out.bad.slice(0, 40); out.off = out.off.slice(0, 40);
  console.table(out.bad); console.table(out.off); console.log(out);
  return { badCount: out.bad.length, offCount: out.off.length, doubles: out.doubles.length, head: out.head };
})();
