"use client";
/**
 * 라벨·행택 / 디테일 수정 옵션 행 편집기 (A-08 원청 기본값 · C-03 상품 예외 공통). 금액은 CNY 원가 — CN·ADMIN 화면 전용.
 * 라벨 문구는 호출부가 넘긴다(i18n).
 */
export type LabelRow = { type: string; moq: number; unit_cost_cny: number; lead_days: number };
export type ModRow = { item: string; moq: number; cost_cny: number; lead_days: number };

const cell = "w-full border border-line bg-surface px-2 py-1 text-[13px] num";

export function LabelRows({ rows, onChange, types, labels, disabled }: {
  rows: LabelRow[]; onChange: (r: LabelRow[]) => void; types: { code: string; label: string }[];
  labels: { moq: string; cost: string; lead: string; add: string; remove: string }; disabled?: boolean;
}) {
  const set = (i: number, p: Partial<LabelRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-1">
          <select className={cell} disabled={disabled} value={r.type} onChange={(e) => set(i, { type: e.target.value })}>
            {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
          <input className={cell} disabled={disabled} aria-label={labels.moq} placeholder={labels.moq} inputMode="numeric" value={r.moq || ""} onChange={(e) => set(i, { moq: Number(e.target.value) || 0 })} />
          <input className={cell} disabled={disabled} aria-label={labels.cost} placeholder={labels.cost} inputMode="decimal" value={r.unit_cost_cny ?? ""} onChange={(e) => set(i, { unit_cost_cny: Number(e.target.value) || 0 })} />
          <input className={cell} disabled={disabled} aria-label={labels.lead} placeholder={labels.lead} inputMode="numeric" value={r.lead_days ?? ""} onChange={(e) => set(i, { lead_days: Number(e.target.value) || 0 })} />
          <button type="button" disabled={disabled} className="px-1 text-[12px] text-muted" onClick={() => onChange(rows.filter((_, k) => k !== i))}>{labels.remove}</button>
        </div>
      ))}
      {!disabled && <button type="button" className="text-[12px] text-signature" onClick={() => onChange([...rows, { type: types[0].code, moq: 100, unit_cost_cny: 0, lead_days: 5 }])}>{labels.add}</button>}
    </div>
  );
}

export function ModRows({ rows, onChange, labels, items, disabled }: {
  rows: ModRow[]; onChange: (r: ModRow[]) => void; items: { code: string; label: string }[];
  labels: { item: string; moq: string; cost: string; lead: string; add: string; remove: string }; disabled?: boolean;
}) {
  const set = (i: number, p: Partial<ModRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-1">
          <select className={cell} disabled={disabled} aria-label={labels.item} value={r.item} onChange={(e) => set(i, { item: e.target.value })}>
            {items.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
          <input className={cell} disabled={disabled} aria-label={labels.moq} placeholder={labels.moq} inputMode="numeric" value={r.moq || ""} onChange={(e) => set(i, { moq: Number(e.target.value) || 0 })} />
          <input className={cell} disabled={disabled} aria-label={labels.cost} placeholder={labels.cost} inputMode="decimal" value={r.cost_cny ?? ""} onChange={(e) => set(i, { cost_cny: Number(e.target.value) || 0 })} />
          <input className={cell} disabled={disabled} aria-label={labels.lead} placeholder={labels.lead} inputMode="numeric" value={r.lead_days ?? ""} onChange={(e) => set(i, { lead_days: Number(e.target.value) || 0 })} />
          <button type="button" disabled={disabled} className="px-1 text-[12px] text-muted" onClick={() => onChange(rows.filter((_, k) => k !== i))}>{labels.remove}</button>
        </div>
      ))}
      {!disabled && <button type="button" className="text-[12px] text-signature" onClick={() => onChange([...rows, { item: items[0].code, moq: 300, cost_cny: 0, lead_days: 7 }])}>{labels.add}</button>}
    </div>
  );
}
