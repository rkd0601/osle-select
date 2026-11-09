import Link from "next/link";

/**
 * 첫 화면 "새 소식" 묶음 (PRD §9, 사이트 수정 8): 읽지 않은 알림 최대 5건을 한곳에 — 카테고리를 하나씩 눌러 보지 않아도 되게.
 * 행을 누르면 그 화면으로 가고(가면 읽음), 전체는 알림 화면. 문구·시각 포맷은 호출부가 로케일에 맞춰 넘긴다.
 */
export function UpdatesPanel(props: {
  title: string;
  items: { id: string; title: string; href: string | null; at: string }[];
  total: number;
  moreHref: string;
  moreLabel: string;
  className?: string;
}) {
  if (props.items.length === 0) return null;
  return (
    <section className={`border-t border-line ${props.className ?? ""}`} aria-label={props.title}>
      <div className="flex items-baseline justify-between gap-4 pb-1 pt-4">
        <h2 className="text-body font-medium text-ink">{props.title} <span className="num ml-1 font-light text-gold">{props.total}</span></h2>
        <Link href={props.moreHref} className="link text-meta">{props.moreLabel}</Link>
      </div>
      <ul>
        {props.items.map((r) => {
          const body = (
            <span className="grid min-h-11 grid-cols-[6px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line py-2.5">
              <span aria-hidden className="st" />
              <span className="truncate text-meta text-ink">{r.title}</span>
              <span className="num text-caption text-muted">{r.at}</span>
            </span>
          );
          return <li key={r.id}>{r.href ? <Link href={r.href} className="block hover:bg-[linear-gradient(90deg,var(--surface),transparent)]">{body}</Link> : body}</li>;
        })}
      </ul>
    </section>
  );
}
