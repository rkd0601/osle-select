/**
 * 상품 사진 (UI 키트, 3:4 실물컷 — D19). 서명 URL이 없으면 사선 패턴 + 코드/라벨 자리표시. 비공개 버킷 서명 URL이라 <img>.
 */
export function Photo({ src, alt = "", label, className = "", ratio = "3/4" }: { src: string | null | undefined; alt?: string; label?: string | null; className?: string; ratio?: "3/4" | "1/1" }) {
  const aspect = ratio === "1/1" ? "aspect-square" : "aspect-[3/4]";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
    return <img src={src} alt={alt} className={`${aspect} w-full rounded-ui bg-sand object-cover ${className}`} />;
  }
  return (
    <span className={`photo-ph flex ${aspect} w-full items-end rounded-ui ${className}`} role="img" aria-label={alt || label || undefined}>
      {label && <span className="num m-2 rounded-sm bg-paper/85 px-1.5 py-0.5 text-micro font-semibold tracking-wide text-ink-2">{label}</span>}
    </span>
  );
}
