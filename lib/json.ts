/** 키 순서 무관 직렬화 — Postgres jsonb는 키를 (길이, 사전) 순으로 돌려주고 zod는 스키마 순서로 만든다 */
export function stableJson(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
