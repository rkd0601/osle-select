/**
 * 표 열을 12칸 선에 맞추는 `<colgroup>` (스펙 §3 L10 · v2.6 R9). spans = 열마다 차지하는 칸 수.
 * 열 폭 = k × (칸 + 24) — 칸 폭은 CSS `--col`(본문 컨테이너 폭에서 계산)이라 어느 화면 폭에서나 열 경계가 칸 선 위.
 * 마지막 열은 나머지(표 오른쪽 끝 = 칸 오른쪽 끝, 마지막 칸 오른쪽 여백 0). 크기 컨테이너(`main.page` · `.cq`) 안에서만 쓴다.
 */
export function GridCols({ spans }: { spans: number[] }) {
  return (
    <colgroup>
      {spans.map((k, i) => (
        <col key={i} style={i === spans.length - 1 ? undefined : { width: `calc(${k} * (var(--col) + var(--cg)))` }} />
      ))}
    </colgroup>
  );
}
