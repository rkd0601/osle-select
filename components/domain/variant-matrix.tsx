"use client";
/**
 * variant 매트릭스 (공통 컴포넌트, CLAUDE.md 코딩 규칙): 체크박스가 아니라 **숫자 입력**.
 * 샘플 요청서는 기본 1·최대 settings.sample_qty_max, 발주서는 확보 수량 이내(max를 칸마다 넘긴다). 행·열 합계 표시.
 * 디자인 v2: 상자 없이 `.tbl` 룰, 칸은 밑줄 입력(44px), 숫자는 SUIT. 넣은 칸만 ink 500.
 * v2.3 정렬: 8칸(span) 안에 사이즈가 다 들어가면 열 경계를 그리드 선에 맞춘다(이름 = 남는 칸, 사이즈·합계 = 1칸씩). 넘치면 예전처럼 가로 스크롤.
 * 색상 hex가 없으면 점 없이 이름만(빈 원 금지, 3차 검증 T6).
 */
import { GridCols } from "./grid-cols";
export type MatrixColor = { id: string; name: string; hex: string | null };
export type MatrixSize = { id: string; label: string };
export type MatrixCell = { variantId: string; colorId: string; sizeId: string; max?: number; disabled?: boolean };

export function VariantMatrix(props: {
  colors: MatrixColor[];
  sizes: MatrixSize[];
  cells: MatrixCell[];
  value: Record<string, number>; // variantId → qty
  onChange: (next: Record<string, number>) => void;
  max: number;
  totalLabel: string;
  /** 표가 차지하는 그리드 칸 수(기본 8 = c8) */
  span?: number;
}) {
  const span = props.span ?? 8;
  const fits = props.sizes.length + 2 <= span;
  const cell = (c: string, s: string) => props.cells.find((x) => x.colorId === c && x.sizeId === s);
  const qty = (id: string | undefined) => (id ? props.value[id] ?? 0 : 0);
  const set = (id: string, v: number, max: number) => props.onChange({ ...props.value, [id]: Math.max(0, Math.min(max, Math.floor(v || 0))) });
  const rowSum = (c: string) => props.sizes.reduce((n, s) => n + qty(cell(c, s.id)?.variantId), 0);
  const colSum = (s: string) => props.colors.reduce((n, c) => n + qty(cell(c.id, s)?.variantId), 0);
  const total = props.colors.reduce((n, c) => n + rowSum(c.id), 0);
  return (
    <div className="max-w-full overflow-x-auto">
      <table className={fits ? "tbl gridt num" : "tbl num w-auto min-w-full"}>
        {fits && <GridCols spans={[span - props.sizes.length - 1, ...props.sizes.map(() => 1), 1]} />}
        <thead>
          <tr>
            <th className="pr-4" />
            {props.sizes.map((s) => <th key={s.id} className={fits ? "text-center" : "px-1 text-center"}>{s.label}</th>)}
            <th className={fits ? "r" : "r pl-4"}>{props.totalLabel}</th>
          </tr>
        </thead>
        <tbody>
          {props.colors.map((c) => (
            <tr key={c.id}>
              <td className={fits ? "py-1.5" : "py-1.5 pr-4"}>
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  {c.hex && <span className="inline-block h-3 w-3 rounded-full border border-line-strong" style={{ background: c.hex }} />}
                  {c.name}
                </span>
              </td>
              {props.sizes.map((s) => {
                const x = cell(c.id, s.id);
                const max = Math.min(props.max, x?.max ?? props.max);
                return (
                  <td key={s.id} className={fits ? "py-1.5" : "px-1 py-1.5"}>
                    {x && !x.disabled ? (
                      <input
                        type="number" inputMode="numeric" min={0} max={max} aria-label={`${c.name} ${s.label}`}
                        className={`field num block text-center ${fits ? "w-full" : "mx-auto w-14"} ${qty(x.variantId) > 0 ? "border-b-ink font-medium text-ink" : "text-ink-2"}`}
                        value={qty(x.variantId)}
                        onChange={(e) => set(x.variantId, Number(e.target.value), max)}
                      />
                    ) : <span className={`block text-center text-muted ${fits ? "w-full" : "mx-auto w-14"}`}>-</span>}
                  </td>
                );
              })}
              <td className={`r text-ink-2 ${fits ? "" : "pl-4"}`}>{rowSum(c.id)}</td>
            </tr>
          ))}
          <tr>
            <td className="border-t border-line-strong py-2 pr-4 text-caption text-muted">{props.totalLabel}</td>
            {props.sizes.map((s) => <td key={s.id} className={`border-t border-line-strong text-center text-ink-2 ${fits ? "" : "px-1"}`}>{colSum(s.id)}</td>)}
            <td className={`r border-t border-line-strong text-lead font-medium text-ink ${fits ? "" : "pl-4"}`}>{total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
