import Link from "next/link";

/**
 * 할 일 행 `.todo` (디자인 v2.2 §4) — 64px 썸네일 · 제목 20/500("무엇을 언제까지") + 보조 13 · 오른쪽 버튼 모양(44px).
 * 행 전체가 상세로 가는 링크(실제 행동은 상세 화면에서). 위아래 1px 룰. 모바일은 버튼이 아래 전폭.
 */
export function TodoRow({ href, photo, title, sub, action }: { href: string; photo: string | null; title: string; sub?: string | null; action: string }) {
  return (
    <Link href={href} className="todo">
      <span className="thumb">
        {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL */}
        {photo && <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      </span>
      <span className="txt">
        <span className="t">{title}</span>
        {sub && <span className="s">{sub}</span>}
      </span>
      <span className="btn">{action}</span>
    </Link>
  );
}

/**
 * 지금 상태 `.nowblock` (디자인 v2.2 §4) — 상세 제목 아래: 56px 썸네일 + 20/500 지금 상태 + 13 한 문장. 핸드오프 카드·상태 점 대신(브랜드 화면).
 * 행동이 있으면 children(버튼·폼)을 오른쪽/아래에 둔다.
 */
export function NowBlock({ photo, title, sub, children }: { photo: string | null; title: string; sub?: string | null; children?: React.ReactNode }) {
  return (
    <section className="nowblock" style={children ? { gridTemplateColumns: "56px minmax(0,1fr) auto" } : undefined}>
      <span className="thumb">
        {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL */}
        {photo && <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      </span>
      <div className="min-w-0">
        <div className="t">{title}</div>
        {sub && <p className="s">{sub}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </section>
  );
}
