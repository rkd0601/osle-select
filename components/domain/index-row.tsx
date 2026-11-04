import Link from "next/link";

/**
 * 인덱스 행 `.row` (디자인 v2 §4) — 목록의 한 줄. 64px 이상, 1px 룰. 제목 16/500 + 메타 13 muted / 상태 / 기한(SUIT 13, 오른쪽).
 * 행 전체가 링크, hover는 surface 그라데이션. 모바일은 기한이 아래 줄. kicker = 제목 앞 작은 코드(번호·종류).
 */
export function IndexRow(props: {
  href: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  kicker?: React.ReactNode;
  status?: React.ReactNode;
  due?: React.ReactNode;
  dueTone?: "default" | "warn" | "crit";
  mine?: boolean; // 내 차례 — 왼쪽 금색 룰
}) {
  const tone = props.dueTone === "crit" ? "text-crit font-medium" : props.dueTone === "warn" ? "text-warn" : "";
  return (
    <Link href={props.href} className={`row ${props.mine ? "border-l-2 border-l-gold pl-4" : ""}`}>
      <div className="min-w-0">
        <div className="t truncate">{props.kicker && <span className="num k">{props.kicker}</span>}{props.title}</div>
        {props.meta && <div className="m truncate">{props.meta}</div>}
      </div>
      <span>{props.status}</span>
      <span className={`due num ${tone}`}>{props.due ?? ""}</span>
    </Link>
  );
}

/** 행 목록 컨테이너 */
export function Rows({ children }: { children: React.ReactNode }) {
  return <div className="rows">{children}</div>;
}
