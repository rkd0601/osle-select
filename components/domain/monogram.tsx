/**
 * 모노그램 `.mono` (디자인 v2 §3) — 28px 금색 1px 테두리 안 시스템 세리프 "OS". 외부 폰트·파일 없음(/cn 규칙 9 포함 어디서나).
 * 금박 3곳 중 하나. 장식이므로 aria-hidden — 이름은 옆 워드마크가 말한다.
 */
export function Monogram({ size = 28, className = "" }: { size?: number; className?: string; tone?: string }) {
  return (
    <span aria-hidden className={`mono shrink-0 ${className}`} style={size === 28 ? undefined : { width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      OS
    </span>
  );
}

/** 모노그램 + 워드마크 "OSLE SELECT" */
export function Mark({ word, size, dark = false }: { word: string; size?: number; dark?: boolean }) {
  return (
    <span className="mark">
      <Monogram size={size} />
      <span className="word" style={dark ? { color: "var(--paper)" } : undefined}>{word}</span>
    </span>
  );
}
