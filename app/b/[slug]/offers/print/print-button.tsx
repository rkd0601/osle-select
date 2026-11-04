"use client";
import { tk } from "@/lib/i18n";

/** 브라우저 인쇄 → "PDF로 저장" (외부 라이브러리 없음) */
export function PrintButton() {
  return (
    <button type="button" className="btn sec sm print:hidden" onClick={() => window.print()}>
      {tk("linesheet.pdfSave")}
    </button>
  );
}
