"use client";
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * 관리자 목록 보조 필터 (브랜드·카테고리 등). 고르면 URL `?<param>=`을 바꾼다 — 서버 컴포넌트가 다시 걸러 그린다. 다른 쿼리(탭·검색)는 유지.
 * 문구(label·allLabel)는 호출부가 i18n으로 넘긴다(규칙 10).
 */
export function QuerySelect({ param, label, allLabel, options, className = "" }: {
  param: string; label: string; allLabel: string; options: { value: string; label: string }[]; className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const value = params.get(param) ?? "";
  return (
    <select aria-label={label} value={value} className={`field w-auto min-w-40 ${className}`} style={{ opacity: pending ? 0.7 : 1 }}
      onChange={(e) => {
        const q = new URLSearchParams(params.toString());
        if (e.target.value) q.set(param, e.target.value); else q.delete(param);
        q.delete("page");
        start(() => router.replace(q.toString() ? `${pathname}?${q}` : pathname, { scroll: false }));
      }}>
      <option value="">{allLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
