/**
 * 숫자 패널 `.figure` (디자인 v2 §4) — 위 1px 룰(첫 패널은 ink, 나머지 line), 라벨 12, 숫자 40/300, 아래 내역 dl 13, 도움말 12.
 * 통화 기호는 0.5em ink-2. 타일 상자 없음(StatGrid 대체).
 */
export function Figure(props: {
  label: string;
  value: React.ReactNode;
  currency?: string; // "₩"
  rows?: [React.ReactNode, React.ReactNode][];
  help?: React.ReactNode;
  first?: boolean;
  dim?: boolean;
  gold?: boolean;
}) {
  return (
    <div className="figure" style={props.first ? undefined : { borderTopColor: "var(--line)" }}>
      <div className="label">{props.label}</div>
      <div className="v num" style={props.dim ? { color: "var(--muted)" } : props.gold ? { color: "var(--gold)" } : undefined}>
        {props.currency && <small>{props.currency}</small>}
        {props.value}
      </div>
      {props.rows && props.rows.length > 0 && (
        <dl>
          {props.rows.map(([dt, dd], i) => (
            <div key={i} className="contents"><dt>{dt}</dt><dd>{dd}</dd></div>
          ))}
        </dl>
      )}
      {props.help && <div className="help">{props.help}</div>}
    </div>
  );
}

/** KPI 줄 `.kpi` — 룰 사이 40/300 숫자, 단위 0.5em muted, 아래 분모 12 */
export function KpiRow({ items }: { items: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; dim?: boolean }[] }) {
  return (
    <div className="kpi">
      {items.map((k) => (
        <div key={k.label}>
          <div className="label">{k.label}</div>
          <div className={`v ${k.dim ? "dim" : ""}`}>{k.value}{k.unit && <span className="ml-1 text-[0.5em] text-muted">{k.unit}</span>}</div>
          {k.sub && <div className="sub">{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}
