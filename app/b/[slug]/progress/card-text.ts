import { tk } from "@/lib/i18n";
import { fmtDay, krw } from "@/lib/format";
import { supplyPriceKrw } from "@/lib/pricing";
import type { ProgressItem } from "@/lib/db/brand/progress";

/**
 * 진행 카드·할 일 행의 사람 말 (디자인 v2.2 §1·§5, DECISIONS d-11). 홈과 진행 화면이 같이 쓴다.
 * 문장 = `state.*` 키 + (기한이 있으면) " · 11월 18일까지"(내 차례) / " · 11월 9일"(위아더·중국 차례).
 * 이름 옆 em = 샘플·발주 "35장", 제안 "₩16,300"(수수료 포함 공급가, lib/pricing). 표시 전용 — 상태 전이와 무관.
 */
export function cardState(c: ProgressItem): string {
  // 최종 견적에 이미 동의해 위아더 차례가 된 발주(u-10)는 "확인해 주세요"가 아니라 동의한 뒤의 문장
  const key = c.stateKey;
  const s = tk(key);
  if (!c.due) return s;
  return `${s} · ${tk(c.mine ? "state.until" : "state.on", { date: fmtDay(c.due) })}`;
}

export function cardEm(c: ProgressItem): string | null {
  if ((c.kind === "order" || c.kind === "sample") && c.qty) return tk("progress.qty", { n: krw(c.qty) });
  if (c.kind === "offer" && c.supplyFrom) return `₩${krw(supplyPriceKrw(c.supplyFrom.productKrw, c.supplyFrom.feeRate))}`;
  return null;
}

export function cardPill(c: ProgressItem): string | null {
  return c.isNew ? tk("state.pill.new") : c.mine ? tk("state.pill.todo") : null;
}

/** 할 일 행: "무엇을 언제까지" 제목 · "11월 18일까지 · 한 문장" · 2~4자 동사 버튼. 템플릿이 없는 상태는 이름 · 상태 문장 + "열기" */
const TODO = new Set([
  "request.needs_info", "offer.new", "offer.reconsent",
  "sample.awaiting_payment", "sample.sent_to_brand", "sample.delivered", "sample.return_due",
  "order.deposit_pending", "order.quoted", "order.final_quoted", "order.sent_to_brand", "order.delivered",
]);

export function todoText(c: ProgressItem): { title: string; sub: string | null; action: string } {
  const k = c.stateKey.replace(/^state\./, "");
  const until = c.due ? tk("state.until", { date: fmtDay(c.due) }) : null;
  if (TODO.has(k)) {
    return {
      title: tk(`todo.${k}.t`, { name: c.name }),
      sub: [until, tk(`todo.${k}.s`)].filter(Boolean).join(" · "),
      action: tk(`todo.${k}.a`),
    };
  }
  return { title: tk("todo.fallback.t", { name: c.name, state: tk(c.stateKey) }), sub: until, action: tk("todo.fallback.a") };
}
