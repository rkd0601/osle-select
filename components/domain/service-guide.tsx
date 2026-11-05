import Link from "next/link";
import { tk } from "@/lib/i18n";

/**
 * 이용 안내 블록 (v2.3 · DECISIONS d-12) — "이렇게 진행돼요" 4단계(3칸씩, 금색 번호) + "자주 묻는 것" 4개(6칸씩).
 * 새 브랜드 첫 화면(홈, 요청 0건)과 설정 › 이용 안내(`/b/[slug]/help`)가 같이 쓴다. 12칸 그리드(`.g12`) 안의 자식들로 그린다.
 * 문구는 ko.json `help.*`(규칙 10).
 */
const STEPS = ["request", "offer", "sample", "order"] as const;
const FAQ = ["price", "moq", "sample", "pay"] as const;

export function ServiceGuide({ helpHref }: { helpHref?: string }) {
  return (
    <>
      <div className="c12 section-h">
        <h2>{tk("help.steps.title")}</h2>
        {helpHref && <Link href={helpHref} className="link">{tk("help.more")}</Link>}
      </div>
      {STEPS.map((s, i) => (
        <div key={s} className="c3 step">
          <div className="k num">{i + 1}</div>
          <div className="t">{tk(`help.step.${s}.t`)}</div>
          <div className="d">{tk(`help.step.${s}.d`)}</div>
          <div className="w">{tk(`help.step.${s}.w`)}</div>
        </div>
      ))}
      <div className="c12 section-h"><h2>{tk("help.faq.title")}</h2></div>
      {FAQ.map((q) => (
        <div key={q} className="c6 faq">
          <div className="q">{tk(`help.faq.${q}.q`)}</div>
          <div className="a">{tk(`help.faq.${q}.a`)}</div>
        </div>
      ))}
    </>
  );
}
