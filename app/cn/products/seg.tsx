"use client";

/**
 * 세그먼트 선택 `.seg` (디자인 v2 §4) — 1px 테두리, 선택은 ink 채움. C-02·C-03의 예/아니오·상속/예외 토글.
 * 문구는 호출부가 i18n으로 넘긴다. fieldset[disabled] 안이면 버튼도 비활성.
 */
export function Seg<K extends string>({ label, value, options, onChange, disabled, className = "" }: {
  label: string; value: K; options: [K, string][]; onChange: (v: K) => void; disabled?: boolean; className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`seg w-fit max-w-full ${className}`}>
      {options.map(([k, text]) => (
        <button key={k} type="button" disabled={disabled} aria-pressed={value === k} onClick={() => onChange(k)}
          className={`whitespace-nowrap px-4 disabled:opacity-50 ${value === k ? "on" : ""}`}>{text}</button>
      ))}
    </div>
  );
}
