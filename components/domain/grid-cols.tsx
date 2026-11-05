/**
 * 그리드 표 열 폭 (스펙 §3 v2.4 L10) — `<table className="tbl gridt">` 안에 `<GridCols spans={[5,1,2,3,1]} />`.
 * 열 폭은 "12분의 n"이 아니라 k × (칸 + 거터) / 표 폭 — 마지막 열만 나머지(k칸 + (k−1)거터)라 표 오른쪽 끝 = 칸 오른쪽 끝.
 * 기준 폭은 최대 레이아웃(본문 1120, 칸 71.33)에서의 n칸 폭. 더 좁은 화면에서는 1~2px 안에서 따라간다.
 * 모든 칸 오른쪽 여백 24(마지막 열 0) → 글자는 칸 오른쪽 끝에서 멈추고, 다음 열은 그리드 선에서 시작한다.
 */
const COL = (1120 - 11 * 24) / 12;
export function GridCols({ spans }: { spans: number[] }) {
  const n = spans.reduce((a, b) => a + b, 0);
  const total = n * COL + (n - 1) * 24;
  return (
    <colgroup>
      {spans.map((k, i) => <col key={i} style={i === spans.length - 1 ? undefined : { width: `${((k * (COL + 24)) / total) * 100}%` }} />)}
    </colgroup>
  );
}
