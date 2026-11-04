/**
 * 화면 머리 (UI 키트). 작은 라벨(eyebrow) · 제목 · 건수 · 설명 · 오른쪽 행동 버튼. 아래 1px 잉크 룰로 본문과 나눈다(에디토리얼, D19).
 * 문구는 호출부가 i18n으로 넘긴다(규칙 10).
 */
export function PageHeader(props: {
  eyebrow?: string;
  title: string;
  count?: number | null;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode; // 제목 아래(탭·필터 등)
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <div className="min-w-0">
          {props.eyebrow && <div className="eyebrow">{props.eyebrow}</div>}
          <h1 className="mt-1 text-h1 font-bold tracking-tight">
            {props.title}
            {props.count != null && <span className="num ml-2 align-top text-h4 font-semibold text-muted">{props.count}</span>}
          </h1>
          {props.description && <p className="mt-1.5 max-w-2xl text-body text-ink-2">{props.description}</p>}
        </div>
        {props.actions && <div className="flex flex-wrap items-center gap-2">{props.actions}</div>}
      </div>
      {props.children && <div className="mt-4">{props.children}</div>}
    </header>
  );
}
