/**
 * 모노그램 로고 (UI 키트) — 금박 이중 테두리 안의 "OS". 무드 레퍼런스(네이비 봉투의 금박 M)를 따른다.
 * 인라인 SVG·시스템 세리프만 쓴다(외부 폰트·파일 없음 — /cn 규칙 9 포함 어디서나 사용 가능). 장식이므로 aria-hidden.
 */
export function Monogram({ size = 36, tone = "gold", className = "" }: { size?: number; tone?: "gold" | "ink" | "paper"; className?: string }) {
  const color = tone === "gold" ? "var(--gold)" : tone === "paper" ? "#f3f3f1" : "var(--ink)";
  return (
    <svg aria-hidden viewBox="0 0 40 40" width={size} height={size} className={className} fill="none" stroke={color}>
      <rect x="1.5" y="1.5" width="37" height="37" strokeWidth="1" />
      <rect x="4.5" y="4.5" width="31" height="31" strokeWidth="0.6" />
      <path d="M1.5 9.5h3M1.5 30.5h3M35.5 9.5h3M35.5 30.5h3M9.5 1.5v3M30.5 1.5v3M9.5 35.5v3M30.5 35.5v3" strokeWidth="0.6" />
      <text x="20" y="25.2" textAnchor="middle" fill={color} stroke="none" fontSize="14" letterSpacing="0.5"
        style={{ fontFamily: 'Didot, "Bodoni 72", "Bodoni MT", Georgia, "Times New Roman", serif', fontStyle: "italic" }}>OS</text>
    </svg>
  );
}
