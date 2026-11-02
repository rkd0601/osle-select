import { CARE, MATERIALS, MEASUREMENTS, ORIGINS, label } from "@/lib/codes";

/**
 * 쇼핑몰 상품 패키지 공통 (PRD D3·10장, B-12). 입력은 브랜드 뷰 컬럼만 — 원가·원청·중량·환율·마진·중국어 원문은
 * ExportProduct 타입에 들어올 수 없다(번역 입력과 같은 컴파일 단계 차단, CLAUDE.md 절대 규칙 1).
 * 판매가는 비워 둔다 — 브랜드가 쇼핑몰에서 정한다(공급가가 쇼핑몰에 올라가는 사고 방지, STEP9 질문 3).
 */
export type ExportProduct = {
  code: string;
  name: string;
  category: string | null;
  desc: string | null;
  qualityNote: string | null;
  fabric: { material_code: string; pct: number }[];
  origin: string | null;
  careCodes: string[];
  colors: string[];
  sizes: { label: string; measurements: Record<string, number> }[];
  variants: { color: string; size: string }[];
  images: string[]; // zip 안 파일명 (images/…)
};
type ForbiddenKeys = "cost_cny" | "tiers" | "price_tiers" | "fx_rate" | "hidden_margin_rate" | "vendor_id" | "vendor" | "weight_g" | "name_zh" | "desc_zh" | "fee_rate";
type AssertNoForbidden<T> = Extract<keyof T, ForbiddenKeys> extends never ? true : never;
const _noCost: AssertNoForbidden<ExportProduct> = true;
void _noCost;

export type ShopType = "cafe24" | "godo" | "imweb" | "smartstore";
export type ShopMapping = { shop: ShopType; version: string; fileName: string; headers: string[]; rows: (p: ExportProduct, detailFile: string) => string[][] };

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const fabricText = (p: ExportProduct) => p.fabric.map((f) => `${label(MATERIALS, f.material_code, "ko")} ${f.pct}%`).join(", ");
export const originText = (p: ExportProduct) => (p.origin ? label(ORIGINS, p.origin, "ko") : "");
export const careText = (p: ExportProduct) => p.careCodes.map((c) => label(CARE, c, "ko")).join(", ");

/** 상세 HTML: 혼용률·사이즈표·세탁·원산지 자동 삽입. 사진은 쇼핑몰에 올린 뒤 브랜드가 넣는다(호스팅 URL이 쇼핑몰마다 다름) */
export function detailHtml(p: ExportProduct): string {
  const keys = [...new Set(p.sizes.flatMap((s) => Object.keys(s.measurements)))];
  const sizeTable = p.sizes.length && keys.length
    ? `<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr><th style="border:1px solid #ddd;padding:6px">사이즈</th>${keys.map((k) => `<th style="border:1px solid #ddd;padding:6px">${esc(label(MEASUREMENTS, k, "ko"))}</th>`).join("")}</tr></thead><tbody>${p.sizes
        .map((s) => `<tr><td style="border:1px solid #ddd;padding:6px">${esc(s.label)}</td>${keys.map((k) => `<td style="border:1px solid #ddd;padding:6px;text-align:center">${s.measurements[k] ?? "-"}</td>`).join("")}</tr>`)
        .join("")}</tbody></table><p style="font-size:12px;color:#888">단위 cm, 측정 방법에 따라 1~3cm 오차가 있을 수 있어요.</p>`
    : "";
  const rows = [
    ["소재", fabricText(p)],
    ["컬러", p.colors.join(", ")],
    ["사이즈", p.sizes.map((s) => s.label).join(", ")],
    ["세탁", careText(p)],
    ["원산지", originText(p)],
  ].filter(([, v]) => v);
  return `<div class="product-detail" style="max-width:860px;margin:0 auto;font-family:sans-serif;color:#222">
${p.desc ? `<p style="white-space:pre-wrap;line-height:1.7">${esc(p.desc)}</p>` : ""}
${p.qualityNote ? `<p style="font-size:13px;color:#555">${esc(p.qualityNote)}</p>` : ""}
<table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:24px">${rows.map(([k, v]) => `<tr><th style="text-align:left;border-top:1px solid #ddd;padding:8px;width:90px">${esc(k)}</th><td style="border-top:1px solid #ddd;padding:8px">${esc(v)}</td></tr>`).join("")}</table>
${sizeTable ? `<h3 style="font-size:15px;margin-top:28px">사이즈 정보</h3>${sizeTable}` : ""}
</div>
`;
}

/** RFC 4180 CSV + UTF-8 BOM (엑셀·쇼핑몰 업로드가 한글을 깨지 않게), CRLF */
export function toCsv(headers: string[], rows: string[][]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [headers, ...rows].map((r) => r.map((v) => cell(v ?? "")).join(",")).join("\r\n") + "\r\n";
}

/** 패키지 산출물에 원가·원청·중국어가 섞이지 않았는지 (테스트·생성 직후 이중 확인) */
const FORBIDDEN_TEXT = /(cost_cny|hidden_margin|fx_rate|weight_g|vendor_id|원가|원청|마진|[一-鿿])/;
export const leaks = (text: string) => FORBIDDEN_TEXT.test(text);
