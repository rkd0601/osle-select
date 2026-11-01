/**
 * 서비스 상수. 서비스명·도메인·코드 접두어는 가칭이며 여기 한 곳만 바꾸면 전체에 반영된다.
 * PRD D1.
 */
export const SERVICE = {
  name: "OSLE Select",
  nameKo: "오슬 셀렉트",
  domain: process.env.NEXT_PUBLIC_APP_URL ?? "https://select.osle.shop",
  productCodePrefix: "OS", // 브랜드 노출용 상품 코드: OS-26FW-0001
  company: "WE ARE THE",
  companyKo: "위아더",
} as const;

/** 역할 코드 (JWT app_metadata.role). PRD 2장 */
export const ROLES = ["ADMIN", "CN_SOURCER", "CN_VENDOR", "BRAND_OWNER", "BRAND_MEMBER"] as const;
export type Role = (typeof ROLES)[number];

export const isBrandRole = (r: Role) => r === "BRAND_OWNER" || r === "BRAND_MEMBER";
export const isCnRole = (r: Role) => r === "CN_SOURCER" || r === "CN_VENDOR";

/** 설정 기본값. DB settings 테이블이 우선, 없으면 이 값. PRD 5장 설정 키 */
export const DEFAULT_SETTINGS = {
  fx_rate_cny_krw: 200,
  hidden_margin_rate: 0.2,
  fee_rate: 0.2,
  sample_air_per_kg_krw: 15000,
  domestic_shipping_krw: 4000, // 결정 필요 (PRD 14장)
  logistics_estimate_per_kg_krw: 5000, // 결정 필요
  customs_estimate_rate: 0.23, // 관세 13% + 부가세 10% 추정. 결정 필요
  exclusive_days: 14,
  offer_valid_days: 30,
  fx_recheck_pct: 0.03,
  sample_feedback_days: 14,
  sample_return_days: 14,
  sample_qty_max: 3,
  report_days: 7,
  cn_question_gate_hours: 4,
  review_sla_days: 2,
  intake_sla_days: 1,
  stock_check_days: 2,
  deposit_days: 3,
  quote_sla_days: 2,
  reconsent_days: 3,
  cn_ship_days: 3,
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = { -readonly [K in SettingKey]: number };

/** 요청 카테고리 기본값. DB settings.categories가 우선 (PRD 5장) */
export const DEFAULT_CATEGORIES = ["아우터", "상의", "하의", "원피스", "신발", "가방", "액세서리"];

/** Storage 버킷 (모두 비공개, PRD 6장) */
export const BUCKETS = {
  requestImages: "request-images",
  productImages: "product-images",
  vendorCards: "vendor-cards",
} as const;
/** 서명 URL 유효 시간(초) */
export const SIGNED_URL_TTL = 60 * 30;
