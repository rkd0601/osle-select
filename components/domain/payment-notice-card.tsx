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
  const tone = state === "confirmed" ? "bg-signature-soft text-signature" : state === "reported" ? "bg-sand text-ink-2" : "bg-warn-soft text-warn";
  return (
    <section className="card relative overflow-hidden">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${state === "confirmed" ? "bg-signature" : "bg-warn"}`} />
      <div className="px-5 pb-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${tone}`}>{tk(`payment.notice.state.${state}`)}</span>
          {props.due && state !== "confirmed" && <span className="num text-caption text-ink-2">{tk("payment.notice.due", { date: fmtDate(props.due, "ko", true) })}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-h4 font-bold">{tk(`${k}.title`)}</h2>
          <span className="num text-title font-semibold tracking-tight">₩{krw(props.amount)}</span>
        </div>
      </div>
      <div className="border-t border-line bg-paper px-5 py-3">
        {props.bank ? (
          <p className="num text-lead font-medium">{props.bank.bank} {props.bank.number} <span className="text-body font-normal text-ink-2">· {tk("payment.notice.holder", { name: props.bank.holder })}</span></p>
        ) : (
          <p className="text-body text-warn">{tk("payment.notice.noAccount")}</p>
        )}
      </div>
      <div className="space-y-0.5 px-5 py-3">
        <p className="text-meta text-ink-2">{tk(`${k}.what`)}</p>
        <p className="text-meta text-ink-2">{tk(`${k}.ifLate`)}</p>
        {state === "reported" && <p className="mt-2 text-meta font-medium text-signature">{tk("payment.notice.reported", { date: fmtDate(props.reportedAt, "ko", true) })}</p>}
        {state === "pending" && props.children && <div className="mt-3 border-t border-line pt-3">{props.children}</div>}
      </div>
    </section>
  );
}
