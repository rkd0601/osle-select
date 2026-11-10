/**
 * 배치 판정 순수 함수 (테스트 필수). 배치 본체는 lib/cron-jobs.ts.
 */

/** 환율 재확인 (PRD D16 ±3%): 발행 시 고정 환율 대비 현재 설정 환율 변동률이 기준 이상이면 true */
export function fxDrifted(issuedFx: number | null | undefined, currentFx: number, pct: number): boolean {
  if (!issuedFx || issuedFx <= 0 || !(currentFx > 0)) return false;
  return Math.abs(currentFx - issuedFx) / issuedFx >= pct - 1e-9;
}

/** 제안 만료: 유효기간(KST 날짜)이 오늘보다 앞이면 만료. 반응 가능한 상태만 */
export const offerExpired = (o: { status: string; valid_until: string }, today: string) =>
  ["new", "interested", "hold"].includes(o.status) && o.valid_until < today;

/** SLA 기한 초과 대상: 담당이 있고 기한이 지난 객체 */
export const slaOverdue = (o: { owner_role: string | null; due_at: string | null }, now: Date) =>
  !!o.owner_role && !!o.due_at && new Date(o.due_at).getTime() < now.getTime();

/** CN 질문 4시간 게이트 해제: 관리자 보류가 아니고 게이트가 지났고 아직 노출 전 */
export const cnGateOpen = (q: { released_at: string | null; held_by_admin: boolean; admin_gate_until: string }, now: Date) =>
  !q.released_at && !q.held_by_admin && new Date(q.admin_gate_until).getTime() <= now.getTime();

/**
 * 단순화 v1 O4 (PRD 2026-11-10): 발송 뒤 report_days(기본 7일) 동안 도착 보고가 없으면 "이상 없음"으로 자동 완료.
 * sent_to_brand는 sent_at 기준, delivered는 report_due(KST 날짜)가 지난 다음 날부터.
 */
export function orderAutoReportDue(o: { status: string; sent_at: string | null; report_due: string | null }, now: Date, days: number): boolean {
  if (o.status === "sent_to_brand") return !!o.sent_at && now.getTime() - new Date(o.sent_at).getTime() >= days * 86400000;
  if (o.status === "delivered") return !!o.report_due && o.report_due < new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  return false;
}
