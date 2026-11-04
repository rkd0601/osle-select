import { tk } from "@/lib/i18n";
import { fmtDate, krw } from "@/lib/format";

/**
 * 입금 안내 (공통 컴포넌트, 기획서 §11 "돈 흐름의 소통"). 결제가 플랫폼 밖이므로 금액·계좌·기한·미입금 시 결과를 템플릿 문구로.
 * 디자인 v2: 행동이 있는 블록이라 입력 상자(surface + 1px line) 하나. 상태 점 → 제목 + 금액(28/300) → 계좌(16) → 한 문장 → 도움말 12.
 * 버튼은 "입금 신고"뿐 — 확인은 관리자(절대 규칙 13). 신고 버튼은 children으로 받는다(서버 컴포넌트 유지).
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
  const dot = state === "confirmed" ? "done" : state === "reported" ? "wait" : "warn";
  return (
    <section className="border border-line bg-surface p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={`st ${dot}`}>{tk(`payment.notice.state.${state}`)}</span>
        {props.due && state !== "confirmed" && <span className="num text-meta text-ink-2">{tk("payment.notice.due", { date: fmtDate(props.due, "ko", true) })}</span>}
      </div>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lead font-medium">{tk(`${k}.title`)}</h2>
        <span className="num text-h1 font-light tracking-[-0.03em]"><span className="mr-0.5 text-[0.5em] font-normal text-ink-2">₩</span>{krw(props.amount)}</span>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        {props.bank ? (
          <p className="num text-lead">{props.bank.bank} {props.bank.number} <span className="text-meta text-ink-2">· {tk("payment.notice.holder", { name: props.bank.holder })}</span></p>
        ) : (
          <p className="text-body text-warn">{tk("payment.notice.noAccount")}</p>
        )}
        <p className="mt-2 text-meta text-ink-2">{tk(`${k}.what`)}</p>
        <p className="mt-1 text-caption text-muted">{tk(`${k}.ifLate`)}</p>
      </div>
      {state === "reported" && <p className="mt-4 bg-signature-soft px-4 py-3 text-meta text-signature">{tk("payment.notice.reported", { date: fmtDate(props.reportedAt, "ko", true) })}</p>}
      {state === "pending" && props.children && <div className="mt-5">{props.children}</div>}
    </section>
  );
}
