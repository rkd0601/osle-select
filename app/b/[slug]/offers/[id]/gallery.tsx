"use client";
import { useState } from "react";
import { tk } from "@/lib/i18n";

/**
 * 제안 상세 큰 사진 + 썸네일 5 (`.bigphoto`, 디자인 v2.2). 썸네일을 누르면 큰 사진이 바뀐다. 사진이 없으면 빈 3:4 면.
 * 입력은 서명 URL 문자열뿐(상품 행을 넘기지 않는다 — 원가 누출 검사).
 */
export function Gallery({ urls, alt }: { urls: string[]; alt: string }) {
  const [on, setOn] = useState(0);
  const thumbs = urls.slice(0, 5);
  return (
    <div className="bigphoto">
      <div className={`photo ${urls.length ? "" : "empty-photo"}`} role={urls.length ? undefined : "img"} aria-label={urls.length ? undefined : alt}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL */}
        {urls[on] && <img src={urls[on]} alt={alt} className="absolute inset-0 h-full w-full object-cover" />}
      </div>
      {thumbs.length > 1 && (
        <div className="thumbs">
          {thumbs.map((u, i) => (
            <button key={u} type="button" className={`photo ${i === on ? "on" : ""}`} aria-label={tk("offer.detail.photoN", { n: i + 1 })} aria-pressed={i === on} onClick={() => setOn(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL */}
              <img src={u} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
