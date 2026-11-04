"use client";
/**
 * 라벨·행택 / 디테일 수정 옵션 행 편집기 (A-08 원청 기본값 · C-03 상품 예외 공통). 금액은 CNY 원가 — CN·ADMIN 화면 전용.
 * 라벨 문구는 호출부가 넘긴다(i18n).
 */
export type LabelRow = { type: string; moq: number; unit_cost_cny: number; lead_days: number };
export type ModRow = { item: string; moq: number; cost_cny: number; lead_days: number };

// 디자인 v2: 밑줄 입력(.field), 상자 테두리 없음
const cell = "field num min-h-10 text-body";

export function LabelRows({ rows, onChange, types, labels, disabled }: {
  rows: LabelRow[]; onChange: (r: LabelRow[]) => void; types: { code: string; label: string }[];
  labels: { item?: string; moq: string; cost: string; lead: string; add: string; remove: string; removeLabel?: string }; disabled?: boolean;
}) {
  const set = (i: number, p: Partial<LabelRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] items-end gap-3">
          <select className={cell} disabled={disabled} aria-label={labels.item} value={r.type} onChange={(e) => set(i, { type: e.target.value })}>
            {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
          <input className={cell} disabled={disabled} aria-label={labels.moq} placeholder={labels.moq} inputMode="numeric" value={r.moq || ""} onChange={(e) => set(i, { moq: Number(e.target.value) || 0 })} />
          <input className={cell} disabled={disabled} aria-label={labels.cost} placeholder={labels.cost} inputMode="decimal" value={r.unit_cost_cny ?? ""} onChange={(e) => set(i, { unit_cost_cny: Number(e.target.value) || 0 })} />
          <input className={cell} disabled={disabled} aria-label={labels.lead} placeholder={labels.lead} inputMode="numeric" value={r.lead_days ?? ""} onChange={(e) => set(i, { lead_days: Number(e.target.value) || 0 })} />
          <button type="button" disabled={disabled} className="min-h-10 px-1 text-meta text-ink-2 hover:text-crit" aria-label={labels.removeLabel ?? labels.remove} onClick={() => onChange(rows.filter((_, k) => k !== i))}>{labels.remove}</button>
        </div>
      ))}
      {!disabled && <button type="button" className="link" onClick={() => onChange([...rows, { type: types[0].code, moq: 100, unit_cost_cny: 0, lead_days: 5 }])}>{labels.add}</button>}
    </div>
  );
}

export function ModRows({ rows, onChange, labels, items, disabled }: {
  rows: ModRow[]; onChange: (r: ModRow[]) => void; items: { code: string; label: string }[];
  labels: { item: string; moq: string; cost: string; lead: string; add: string; remove: string; removeLabel?: string }; disabled?: boolean;
}) {
  const set = (i: number, p: Partial<ModRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] items-end gap-3">
          <select className={cell} disabled={disabled} aria-label={labels.item} value={r.item} onChange={(e) => set(i, { item: e.target.value })}>
            {items.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
          <input className={cell} disabled={disabled} aria-label={labels.moq} placeholder={labels.moq} inputMode="numeric" value={r.moq || ""} onChange={(e) => set(i, { moq: Number(e.target.value) || 0 })} />
          <input className={cell} disabled={disabled} aria-label={labels.cost} placeholder={labels.cost} inputMode="decimal" value={r.cost_cny ?? ""} onChange={(e) => set(i, { cost_cny: Number(e.target.value) || 0 })} />
          <input className={cell} disabled={disabled} aria-label={labels.lead} placeholder={labels.lead} inputMode="numeric" value={r.lead_days ?? ""} onChange={(e) => set(i, { lead_days: Number(e.target.value) || 0 })} />
          <button type="button" disabled={disabled} className="min-h-10 px-1 text-meta text-ink-2 hover:text-crit" aria-label={labels.removeLabel ?? labels.remove} onClick={() => onChange(rows.filter((_, k) => k !== i))}>{labels.remove}</button>
        </div>
      ))}
      {!disabled && <button type="button" className="link" onClick={() => onChange([...rows, { item: items[0].code, moq: 300, cost_cny: 0, lead_days: 7 }])}>{labels.add}</button>}
    </div>
  );
}
