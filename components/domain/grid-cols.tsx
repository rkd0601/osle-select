/**
 * 그리드 표 열 폭 (디자인 v2.3 정렬 규칙, DESIGN_SPEC §3) — `<table className="tbl gridt">` 안에 `<GridCols spans={[5,1,2,3,1]} />`.
 * `.tbl.gridt`는 표를 거터 하나만큼 넓혀(n칸 + n거터, 넘친 24px는 잘라 냄) 열 k칸 = k/n 비율이 정확히 k × (칸 + 거터)가 되게 한다
 * → 각 열의 왼쪽 모서리는 그리드 선, 칸 오른쪽 여백 24로 글자는 칸 오른쪽 끝에서 멈춘다. 표는 spans 합만큼의 칸(c8이면 8) 안에 둔다.
 */
export function GridCols({ spans }: { spans: number[] }) {
  const n = spans.reduce((a, b) => a + b, 0);
  return (
    <colgroup>
      {spans.map((k, i) => <col key={i} style={{ width: `${(k / n) * 100}%` }} />)}
    </colgroup>
  );
}
