// 12칸 그리드 정렬 검사 — 브라우저 콘솔에 붙여넣기 (브랜드 화면). 블록의 왼쪽 또는 오른쪽 모서리가 그리드 선(±2px)에 없으면 목록에 나온다.
(() => { const main=document.querySelector('main'); const wrap=main.getBoundingClientRect(); const cs=getComputedStyle(main);
  const L=wrap.left+parseFloat(cs.paddingLeft), R=wrap.right-parseFloat(cs.paddingRight); const col=((R-L)-11*24)/12;
  const lines=[...Array(12)].map((_,i)=>Math.round(L+i*(col+24))); const rights=lines.map(x=>Math.round(x+col));
  const els=[...main.querySelectorAll('h1,h2,h3,button,a,article,section,table,th,td,img,p,div,dl,ul,aside')].filter(e=>e.offsetWidth>60&&e.offsetHeight>14);
  const off=[], seen=new Set();
  for (const e of els) { const r=e.getBoundingClientRect(); const l=Math.round(r.left), rr=Math.round(r.right); const key=e.tagName+String(e.className).slice(0,25)+l+'-'+rr; if (seen.has(key)) continue; seen.add(key);
    if (getComputedStyle(e).display==='inline') continue;
    const dl=Math.min(...lines.map(x=>Math.abs(x-l))), dr=Math.min(...rights.map(x=>Math.abs(x-rr)));
    if (dl>2 && dr>2) off.push({el:e.tagName+'.'+String(e.className).slice(0,30), text:e.textContent.trim().slice(0,20), left:l, right:rr}); }
  console.table(off); return {lines, offCount: off.length}; })();
