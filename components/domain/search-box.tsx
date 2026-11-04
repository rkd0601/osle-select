"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * 목록 검색 (UI 키트). 입력 0.3초 뒤 URL `?q=`를 바꾼다 — 서버 컴포넌트가 다시 걸러 그린다. 다른 쿼리(탭 등)는 유지.
 * 문구(placeholder·aria-label)는 호출부가 i18n으로 넘긴다.
 */
export function SearchBox({ placeholder, label, param = "q", className = "" }: { placeholder: string; label: string; param?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(param) ?? "");
  const [pending, start] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = setTimeout(() => {
      const q = new URLSearchParams(params.toString());
      if (value.trim()) q.set(param, value.trim()); else q.delete(param);
      q.delete("page");
      start(() => router.replace(q.toString() ? `${pathname}?${q}` : pathname, { scroll: false }));
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 입력값 변화에만 반응
  }, [value]);

  return (
    <div className={`relative ${className}`}>
      <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="9" cy="9" r="6" /><path d="m14 14 4 4" strokeLinecap="round" />
      </svg>
      <input type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={label}
        className="field pl-9" style={{ opacity: pending ? 0.7 : 1 }} />
    </div>
  );
}
