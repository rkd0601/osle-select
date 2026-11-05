import { tk } from "@/lib/i18n";
import { fmtDay, krw } from "@/lib/format";
import { supplyPriceKrw } from "@/lib/pricing";
import { cardActionHref, cardSentence } from "@/lib/brand-progress";
import type { ProgressItem } from "@/lib/db/brand/progress";

/**
 * 진행 카드·할 일 행의 사람 말 (디자인 v2.2 §1·§5, DECISIONS d-11·d-18). 홈과 진행 화면이 같이 쓴다.
 * 상태 한 줄 = "종류 수량 · 상태 · 날짜"(lib/brand-progress.cardSentence) — 샘플·발주 수량은 이름 옆이 아니라 문장 첫머리.
 * 이름 옆 em은 제안의 수수료 포함 공급가 "₩16,300"(lib/pricing)만. 표시 전용 — 상태 전이와 무관.
 */
export function cardState(c: ProgressItem): string {
  return cardSentence(c);
}

export function cardEm(c: ProgressItem): string | null {
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

/** 할 일 버튼(D4): 문구는 할 일 행과 같은 동사, 주소는 상세 안 해당 블록(#return 등). 제안 확인(새 제안)은 카드의 빠른 반응 버튼이 대신한다 */
export function cardAction(c: ProgressItem, base: string): { href: string; label: string } | null {
  if (!c.mine || (c.kind === "offer" && c.isNew)) return null;
  return { href: `${base}${cardActionHref(c)}`, label: todoText(c).action };
}
