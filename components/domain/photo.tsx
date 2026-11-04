/**
 * 상품 사진 `.photo` (디자인 v2 §4) — 3:4, `--well` 자리, radius 0. 코드 태그 왼쪽 아래(11px SUIT), "실물 확인" 왼쪽 위(금색 점).
 * 비공개 버킷 서명 URL이라 <img>. 사진이 없으면 자리만(코드 태그는 그대로).
 */
export function Photo({ src, alt = "", label, verified, className = "", ratio = "3/4", children }: {
  src: string | null | undefined;
  alt?: string;
  label?: string | null;       // 코드 태그(왼쪽 아래)
  verified?: string | null;    // "실물 확인" 문구(왼쪽 위) — i18n된 문자열
  className?: string;
  ratio?: "3/4" | "1/1";
  children?: React.ReactNode;  // 추가 배지(오른쪽 위 등)
}) {
  return (
    <div className={`photo ${className}`} style={ratio === "1/1" ? { aspectRatio: "1 / 1" } : undefined} role={src ? undefined : "img"} aria-label={src ? undefined : alt || label || undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL */}
      {src && <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" />}
      {verified && <span className="verified">{verified}</span>}
      {label && <span className="tag">{label}</span>}
      {children}
    </div>
  );
}
