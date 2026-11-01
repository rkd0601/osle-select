/**
 * 구조화 입력 코드 사전 (PRD D12: 혼용률·사이즈·세탁·컬러는 번역하지 않고 코드로). 라벨은 ko/zh 병기.
 * 화면은 코드를 저장하고 표시할 때만 라벨로 바꾼다. 새 코드는 여기 한 곳에만 추가한다.
 */
export type Coded = { code: string; ko: string; zh: string };

export const MATERIALS: Coded[] = [
  { code: "polyester", ko: "폴리에스터", zh: "涤纶" },
  { code: "cotton", ko: "면", zh: "棉" },
  { code: "nylon", ko: "나일론", zh: "锦纶" },
  { code: "acrylic", ko: "아크릴", zh: "腈纶" },
  { code: "wool", ko: "울", zh: "羊毛" },
  { code: "cashmere", ko: "캐시미어", zh: "羊绒" },
  { code: "viscose", ko: "레이온(비스코스)", zh: "粘纤" },
  { code: "modal", ko: "모달", zh: "莫代尔" },
  { code: "linen", ko: "린넨", zh: "亚麻" },
  { code: "silk", ko: "실크", zh: "真丝" },
  { code: "spandex", ko: "스판덱스", zh: "氨纶" },
  { code: "polyurethane", ko: "폴리우레탄", zh: "聚氨酯" },
  { code: "leather", ko: "천연가죽", zh: "真皮" },
  { code: "faux_fur", ko: "인조 모피", zh: "人造毛" },
  { code: "other", ko: "기타", zh: "其他" },
];

export const CARE: Coded[] = [
  { code: "machine_30", ko: "세탁기 30℃", zh: "机洗30℃" },
  { code: "hand_wash", ko: "손세탁", zh: "手洗" },
  { code: "dry", ko: "드라이클리닝", zh: "干洗" },
  { code: "no_bleach", ko: "표백 금지", zh: "不可漂白" },
  { code: "no_tumble", ko: "건조기 금지", zh: "不可烘干" },
  { code: "flat_dry", ko: "뉘어서 건조", zh: "平铺晾干" },
  { code: "iron_low", ko: "낮은 온도 다림질", zh: "低温熨烫" },
  { code: "no_iron", ko: "다림질 금지", zh: "不可熨烫" },
];

export const ORIGINS: Coded[] = [
  { code: "CN", ko: "중국", zh: "中国" },
  { code: "KR", ko: "한국", zh: "韩国" },
  { code: "VN", ko: "베트남", zh: "越南" },
  { code: "OTHER", ko: "기타", zh: "其他" },
];

/** 카테고리 ko 원문(settings.categories와 같은 문자열) → zh 표시 */
export const CATEGORY_ZH: Record<string, string> = {
  아우터: "外套", 상의: "上衣", 하의: "下装", 원피스: "连衣裙", 신발: "鞋", 가방: "包", 액세서리: "配饰",
};

/** 카테고리별 실측 부위(cm). 기획서 §6 "카테고리별 부위 템플릿". 범위는 F3 "cm 값 범위 체크". */
export const MEASUREMENTS: Coded[] = [
  { code: "length", ko: "총장", zh: "衣长" },
  { code: "shoulder", ko: "어깨", zh: "肩宽" },
  { code: "chest", ko: "가슴단면", zh: "胸围(半)" },
  { code: "sleeve", ko: "소매", zh: "袖长" },
  { code: "waist", ko: "허리단면", zh: "腰围(半)" },
  { code: "hip", ko: "엉덩이단면", zh: "臀围(半)" },
  { code: "thigh", ko: "허벅지단면", zh: "大腿围(半)" },
  { code: "hem", ko: "밑단", zh: "脚口" },
  { code: "rise", ko: "밑위", zh: "前裆" },
];
export const MEASUREMENT_TEMPLATE: Record<string, string[]> = {
  아우터: ["length", "shoulder", "chest", "sleeve"],
  상의: ["length", "shoulder", "chest", "sleeve"],
  원피스: ["length", "shoulder", "chest", "waist", "sleeve"],
  하의: ["length", "waist", "hip", "thigh", "hem", "rise"],
};
export const MEASUREMENT_RANGE: Record<string, [number, number]> = {
  length: [20, 160], shoulder: [20, 80], chest: [25, 100], sleeve: [10, 100], waist: [20, 80],
  hip: [25, 90], thigh: [10, 50], hem: [8, 40], rise: [10, 50],
};

export const SUPPLY_TYPES = ["stock", "production", "mixed"] as const;
/** 예상 수량 구간 (COWORK_DECISIONS Q2). "소량/대량" 단어 없이 숫자만 — i18n qtyRange.<code> */
export const QTY_RANGES = ["lt30", "30_100", "100_300", "300_1000", "gt1000", "tbd"] as const;
/** 디테일 수정 항목 코드 (브랜드에 자유 입력 중국어가 보이지 않게, 5단계 리뷰 1) — i18n product.option.mod.<code> */
export const MOD_ITEMS = ["add_color", "length", "fabric", "button", "embroidery", "print", "lining", "fit", "other"] as const;
export const IMAGE_KINDS = ["real", "model", "detail", "label", "size_chart"] as const;
export const IMAGE_SOURCES = ["own", "vendor", "reference"] as const;

export const label = (list: Coded[], code: string, locale: "ko" | "zh-CN") => {
  const c = list.find((x) => x.code === code);
  return c ? (locale === "ko" ? c.ko : c.zh) : code;
};
export const isCode = (list: Coded[], code: string) => list.some((x) => x.code === code);
