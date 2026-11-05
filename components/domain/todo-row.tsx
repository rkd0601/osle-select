import Link from "next/link";

/**
 * 할 일 행 `.todo` (디자인 v2.2 §4, 4차 검증 D4) — 1칸 썸네일 · 제목 20/500("무엇을 언제까지") + 보조 13 · 오른쪽 버튼(44px).
 * 썸네일·글은 상세(href)로, 버튼은 해당 행동 블록(actionHref, 예: 상세의 #return)으로 — 링크 셋이 `.todo`의 직접 자식이라 중첩 링크가 없다.
 * 썸네일 링크는 글 링크와 같은 곳이라 탭 순서·보조기기에서 뺀다. 위아래 1px 룰. 모바일은 버튼이 아래 전폭(`.todo > .btn`).
 */
export function TodoRow({ href, actionHref, photo, title, sub, action }: { href: string; actionHref?: string; photo: string | null; title: string; sub?: string | null; action: string }) {
  return (
    <div className="todo">
      <Link href={href} className="thumb" tabIndex={-1} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL */}
        {photo && <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      </Link>
      <Link href={href} className="txt">
        <span className="t">{title}</span>
        {sub && <span className="s">{sub}</span>}
      </Link>
      <Link href={actionHref ?? href} className="btn">{action}</Link>
    </div>
  );
}

/**
 * 지금 상태 `.nowblock` (디자인 v2.2 §4) — 상세 제목 아래: 56px 썸네일 + 20/500 지금 상태 + 13 한 문장. 핸드오프 카드·상태 점 대신(브랜드 화면).
 * 행동이 있으면 children(버튼·폼)을 오른쪽/아래에 둔다.
 */
export function NowBlock({ photo, title, sub, children }: { photo: string | null; title: string; sub?: string | null; children?: React.ReactNode }) {
  return (
    <section className={children ? "nowblock has-act" : "nowblock"}>
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
