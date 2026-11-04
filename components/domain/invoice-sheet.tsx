/**
 * 청구표 `.invoice` (디자인 v2 §4) — 화면의 유일한 상자(surface + 1px line, 패딩 28, sticky 24).
 * 라벨 → 합계 40/300 → 항목 표(14, 룰) → 합계 행 위 금색 1px → 안내 박스(signature-soft) → 도움말 12. 행동(동의 버튼 등)은 children.
 */
export function InvoiceSheet(props: {
  label: string;
  total: number | null;
  rows: { label: React.ReactNode; value: number; minus?: boolean; hidden?: boolean }[];
  sumLabel: string;
  note?: React.ReactNode;
  help?: React.ReactNode;
  empty?: React.ReactNode; // 금액이 아직 없을 때 한 문장
  children?: React.ReactNode;
}) {
  const krw = (n: number) => new Intl.NumberFormat("ko-KR").format(n);
  const rows = props.rows.filter((r) => !r.hidden);
  return (
    <section className="invoice">
      <div className="label">{props.label}</div>
      {props.total == null ? (
        <p className="text-body text-ink-2">{props.empty}</p>
      ) : (
        <>
          <div className="total num"><span className="mr-1 align-[12px] text-[0.5em] font-normal text-ink-2">₩</span>{krw(props.total)}</div>
          <table>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{r.label}</td><td>{r.minus ? "−" : ""}₩{krw(r.value)}</td></tr>
              ))}
              <tr className="sum"><td>{props.sumLabel}</td><td>₩{krw(props.total)}</td></tr>
            </tbody>
          </table>
        </>
      )}
      {props.note && <div className="note-in">{props.note}</div>}
      {props.children && <div className="mt-5">{props.children}</div>}
      {props.help && <p className="help">{props.help}</p>}
    </section>
  );
}
