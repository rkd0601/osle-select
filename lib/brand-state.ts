/**
 * 브랜드 화면 "지금" 한 문장 (디자인 v2.2 · DECISIONS d-11) — 순수 함수. 상세의 `.nowblock`과 청구 표 "지금" 열이 같은 문장을 쓴다.
 * 결과는 ko.json `state.*` 키(사람 말). 상태 전이와 무관한 표시 전용 — 전이는 서버 액션이 결정한다(규칙 4).
 */
export function orderStateKey(o: { status: string; owner_role?: string | null; deposit_reported_at?: string | null; deposit_confirmed_at?: string | null }, opts?: { finalApproved?: boolean }): string {
  if (o.status === "deposit_pending" && o.deposit_reported_at && !o.deposit_confirmed_at) return "state.order.deposit_reported";
  // 최종 견적에 동의했으면 위아더가 확정할 차례 (u-10) — 상세는 감사 로그로, 목록은 owner_role로 판정
  if (o.status === "final_quoted" && (opts?.finalApproved ?? (o.owner_role != null && o.owner_role !== "BRAND"))) return "state.order.final_agreed";
  return `state.order.${o.status}`;
}

export function sampleStateKey(r: { status: string; payment_reported_at?: string | null; payment_confirmed_at?: string | null }, items: { return_status: string | null; return_requested_at?: string | null }[]): string {
  if (r.status === "awaiting_payment" && r.payment_reported_at && !r.payment_confirmed_at) return "state.sample.payment_reported";
  if (r.status === "feedback_done") {
    if (items.some((i) => i.return_status === "due" && !i.return_requested_at)) return "state.sample.return_due";
    // 회수 신청은 했고 위아더가 아직 받지 않음 — "회수 완료"로 보이지 않게
    if (items.some((i) => i.return_status === "due" && i.return_requested_at)) return "state.sample.return_requested";
    return items.length > 0 && items.every((i) => i.return_status === "kept") ? "state.sample.kept" : "state.sample.returned";
  }
  return `state.sample.${r.status}`;
}

/** 브랜드가 행동할 차례인지(지금 상태 문장 아래 기한을 "까지"로 붙일지) */
export function orderIsMine(o: { status: string; owner_role?: string | null; deposit_reported_at?: string | null }, finalApproved = false): boolean {
  if (o.status === "deposit_pending" && o.deposit_reported_at) return false;
  if (o.status === "final_quoted" && finalApproved) return false;
  return o.owner_role === "BRAND";
}

/** 요청 상세 지금 블록 둘째 줄의 이름(4차 검증 D8): 첫 쉼표 앞, 8자까지(넘으면 8자 + "…") */
export function nowName(name: string, max = 8): string {
  const s = name.split(/[,，]/)[0].trim();
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}

/** 같은 값끼리 묶어 처음 나온 순서대로 [값, 개수] — "찾는 중 1 · 확인 중 2"(D8) */
export function countInOrder(xs: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m];
}

/** 지금 상태 아래 한 줄: 조각들을 " · "로 잇되 문장 끝 마침표는 뗀다("동의한 금액으로 고정돼요 · 11월 5일까지") */
export function oneLine(parts: (string | null | undefined | false)[]): string | null {
  const xs = parts.filter((x): x is string => !!x).map((x) => x.trim().replace(/[.。]$/, ""));
  return xs.length ? xs.join(" · ") : null;
}
