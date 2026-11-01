import { tk } from "@/lib/i18n";
import { fmtDate, krw } from "@/lib/format";

/**
 * 입금 안내 카드 (공통 컴포넌트 8/8, 기획서 §11 "돈 흐름의 소통"). 결제가 플랫폼 밖이므로 금액·계좌·기한·미입금 시 결과를 템플릿 문구로.
 * 버튼은 "입금했어요" 신고뿐 — 확인은 관리자(절대 규칙 13). 신고 버튼은 children으로 받는다(서버 컴포넌트 유지).
 */
export function PaymentNoticeCard(props: {
  amount: number;
  bank: { bank: string; number: string; holder: string } | null;
  due: string | null;
  reportedAt: string | null;
  confirmedAt: string | null;
  /** 샘플비(기본) · 발주 선금 — 제목·안내 문구 템플릿 키 접두어 */
  kind?: "sample" | "deposit";
  children?: React.ReactNode;
}) {
  const k = props.kind === "deposit" ? "payment.deposit" : "payment.notice";
  const state = props.confirmedAt ? "confirmed" : props.reportedAt ? "reported" : "pending";
  return (
    <section className={`border-l-2 ${state === "confirmed" ? "border-signature" : "border-warn"} bg-surface px-5 py-4`}>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted">
        <span>{tk(`payment.notice.state.${state}`)}</span>
        {props.due && state !== "confirmed" && <span className="num">{tk("payment.notice.due", { date: fmtDate(props.due, "ko", true) })}</span>}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold">{tk(`${k}.title`)}</h2>
        <span className="num text-[24px] font-semibold tracking-tight">₩{krw(props.amount)}</span>
      </div>
      {props.bank ? (
        <p className="num mt-2 text-[14px]">{props.bank.bank} {props.bank.number} · {tk("payment.notice.holder", { name: props.bank.holder })}</p>
      ) : (
        <p className="mt-2 text-[13px] text-warn">{tk("payment.notice.noAccount")}</p>
      )}
      <p className="mt-2 text-[12px] text-ink-2">{tk(`${k}.what`)}</p>
      <p className="text-[12px] text-ink-2">{tk(`${k}.ifLate`)}</p>
      {state === "reported" && <p className="mt-2 text-[12px] text-signature">{tk("payment.notice.reported", { date: fmtDate(props.reportedAt, "ko", true) })}</p>}
      {state === "pending" && props.children && <div className="mt-3">{props.children}</div>}
    </section>
  );
}
