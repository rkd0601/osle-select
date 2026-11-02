import type { TranslatableField } from "./index";

/**
 * 용어 사전 승인 대기 자동 적재 (DECISIONS r8-3, 순수). 번역 결과 가운데 "용어"로 볼 짧은 짝만 고른다 —
 * 컬러명 필드, 또는 공백·문장부호 없는 6자 이하 원문. 문장·상품명은 사전을 더럽히므로 넣지 않는다.
 * 이미 사전에 있는 똑같은 짝은 건너뛴다(DB에서도 (term_zh, term_ko) 유니크로 한 번 더).
 */
const TERM_FIELDS = new Set<TranslatableField>(["color_name"]);
const HAN = /[一-鿿]/;
const HANGUL = /[가-힣]/;

export function termCandidates(
  from: "ko" | "zh-CN",
  segments: { field: TranslatableField; text: string }[],
  outputs: string[],
  known: { term_zh: string; term_ko: string }[],
): { term_zh: string; term_ko: string }[] {
  const seen = new Set(known.map((k) => `${k.term_zh}\u0000${k.term_ko}`));
  const out: { term_zh: string; term_ko: string }[] = [];
  segments.forEach((s, i) => {
    const src = s.text.trim();
    const dst = (outputs[i] ?? "").trim();
    if (!src || !dst || src.length > 40 || dst.length > 40) return;
    const termy = TERM_FIELDS.has(s.field) || (src.length <= 6 && !/[\s.,!?;:()\[\]、，。！？；：（）]/.test(src));
    if (!termy) return;
    const [zh, ko] = from === "zh-CN" ? [src, dst] : [dst, src];
    if (!HAN.test(zh) || !HANGUL.test(ko)) return;
    const key = `${zh}\u0000${ko}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ term_zh: zh, term_ko: ko });
  });
  return out;
}
