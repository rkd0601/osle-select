/**
 * 화면 머리 `.phead` (디자인 v2 §4) — 눈썹(날짜·#id 등) · 제목(28/500, 건수는 300 muted) · 설명 최대 한 문장 · 오른쪽 버튼. 아래 1px ink 룰.
 * display=true면 제목이 40/300(홈의 "지금 결정할 일 n"). 문구는 호출부가 i18n으로 넘긴다(규칙 10).
 */
export function PageHeader(props: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  count?: number | null;
  countGold?: boolean;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  display?: boolean;
  children?: React.ReactNode; // 머리 아래(탭·필터 등)
}) {
  return (
    <header className="mb-8">
      <div className="phead">
        <div className="min-w-0">
          {props.eyebrow && <div className="eyebrow">{props.eyebrow}</div>}
          <h1 className={props.display ? "display" : "h1"} style={{ marginTop: props.eyebrow ? 12 : 0 }}>
            {props.title}
            {props.count != null && (
              <span className="num ml-3" style={{ fontWeight: 300, color: props.countGold ? "var(--gold)" : "var(--muted)" }}>{props.count}</span>
            )}
          </h1>
          {props.description && <p className="sub">{props.description}</p>}
        </div>
        {props.actions && <div className="flex flex-wrap items-center gap-2.5">{props.actions}</div>}
      </div>
      {props.children && <div className="mt-6">{props.children}</div>}
    </header>
  );
}
