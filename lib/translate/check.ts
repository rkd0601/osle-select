/**
 * 번역 검증 순수 함수 (PRD D12, 기획서 §11 "이중 검증"). 서버 전용 모듈(index.ts)과 분리해 테스트한다.
 * 원문 ↔ 역번역의 문자 bigram 유사도가 낮거나, 승인된 용어 사전의 대응어를 어긴 필드를 "불확실"로 표시한다.
 * 관리자(A-03)는 하이라이트된 필드만 본다.
 */
export type GlossaryTerm = { term_zh: string; term_ko: string };
export type FieldCheck = { similarity: number; uncertain: boolean; back: string; glossaryMisses: string[] };

/** 공백·문장부호를 뺀 문자 bigram 다이스 계수 (0~1). 한·중 모두 글자 단위로 비교된다. */
export function bigramSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
  const grams = (s: string) => {
    const n = norm(s);
    if (n.length < 2) return n ? [n] : [];
    return Array.from({ length: n.length - 1 }, (_, i) => n.slice(i, i + 2));
  };
  const A = grams(a), B = grams(b);
  if (!A.length && !B.length) return 1;
  if (!A.length || !B.length) return 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) { hit++; counts.set(g, c - 1); }
  }
  return Math.round(((2 * hit) / (A.length + B.length)) * 100) / 100;
}

/** 원문에 나온 사전 용어의 대응어가 번역문에 없으면 위반 (zh→ko 기준 / ko→zh는 반대로) */
export function glossaryMisses(source: string, translated: string, glossary: GlossaryTerm[], dir: "zh>ko" | "ko>zh"): string[] {
  return glossary
    .filter((g) => (dir === "zh>ko" ? source.includes(g.term_zh) && !translated.includes(g.term_ko) : source.includes(g.term_ko) && !translated.includes(g.term_zh)))
    .map((g) => (dir === "zh>ko" ? `${g.term_zh}→${g.term_ko}` : `${g.term_ko}→${g.term_zh}`));
}

/** 불확실 판정 임계값. 짧은 문구는 역번역이 달라지기 쉬워 기준을 낮춘다. */
export const SIMILARITY_MIN = 0.5;
export function checkField(source: string, translated: string, back: string, glossary: GlossaryTerm[], dir: "zh>ko" | "ko>zh"): FieldCheck {
  const similarity = bigramSimilarity(source, back);
  const misses = glossaryMisses(source, translated, glossary, dir);
  const min = source.replace(/\s/g, "").length <= 6 ? 0.3 : SIMILARITY_MIN;
  return { similarity, uncertain: similarity < min || misses.length > 0 || (!!source.trim() && !translated.trim()), back, glossaryMisses: misses };
}
