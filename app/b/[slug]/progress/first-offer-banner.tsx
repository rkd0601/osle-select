"use client";
import { useEffect, useState } from "react";
import { tk } from "@/lib/i18n";

/**
 * 새 제안 첫 안내 (v2.3 §0-e 4) — 브랜드가 제안을 처음 받았을 때 진행 화면 위 한 줄, 닫으면 다시 안 나온다.
 * 저장: 이 브라우저의 localStorage(브랜드별 키). 서버 저장(brands.onboarding)은 마이그레이션 없이 갈 수 있는 이 방식으로 대신 — STEP17 노트 질문.
 * 처음 그릴 때는 숨겨 두고(서버·클라이언트 렌더 일치) 저장값을 읽은 뒤 보인다.
 */
export function FirstOfferBanner({ brandId }: { brandId: string }) {
  const key = `osle.onboarding.firstOffer.${brandId}`;
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { setShow(localStorage.getItem(key) !== "1"); } catch { setShow(true); }
  }, [key]);
  if (!show) return null;
  const close = () => {
    setShow(false);
    try { localStorage.setItem(key, "1"); } catch { /* 저장 불가(사생활 보호 모드 등) — 이번 화면에서만 닫는다 */ }
  };
  return (
    <div className="c12 notice" role="status">
      <p>{tk("progress.firstOffer")}</p>
      <button type="button" className="link" onClick={close}>{tk("common.close")}</button>
    </div>
  );
}
