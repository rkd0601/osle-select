/**
 * A-01 KPI 보드 순수 계산 (PRD D2·12장 "info_match_rate가 KPI 보드에 뜬다"). 비율은 0~100 소수 1자리, 분모 0이면 null.
 */
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/** 정보 일치율 평균 (본품 검품 info_match_rate의 평균) */
export function avgMatchRate(rows: { info_match_rate: number | string | null }[]) {
  const xs = rows.map((r) => (r.info_match_rate == null ? null : Number(r.info_match_rate))).filter((x): x is number => x != null && !Number.isNaN(x));
  return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
}

/** 제안 → 관심 전환율: 반응한 제안 중 관심(이후 단계 포함). 아직 반응 없는 new는 분모에서 뺀다 */
export function offerInterestRate(rows: { status: string; reaction: string | null }[]) {
  const reacted = rows.filter((r) => r.reaction != null || ["interested", "hold", "declined"].includes(r.status));
  return pct(reacted.filter((r) => (r.reaction ?? r.status) === "interested").length, reacted.length);
}

/** 샘플 → 발주 전환율: 샘플 관심 피드백을 받은 제안 중 확정 발주 라인이 있는 제안 */
export function sampleToOrderRate(sampleInterestedOfferIds: string[], orderedOfferIds: string[]) {
  const s = new Set(sampleInterestedOfferIds);
  const o = new Set(orderedOfferIds);
  return pct([...s].filter((id) => o.has(id)).length, s.size);
}

/** 기한 초과 비율: 담당이 있는 열린 객체 중 기한이 지난 것 */
export function overdueShare(rows: { due_at: string | null }[], now: Date) {
  const withDue = rows.filter((r) => r.due_at);
  return pct(withDue.filter((r) => new Date(r.due_at!).getTime() < now.getTime()).length, withDue.length);
}
