import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// CLAUDE.md 절대 규칙 1: 브랜드 측 코드는 원가·원청 테이블을 직접 조회하지 않는다(v_*_brand 뷰만).
const fromTable = (names) => ({
  selector: `CallExpression[callee.property.name='from'][arguments.0.value=/^(${names.join("|")})$/]`,
  message: "브랜드 측 코드는 이 테이블을 직접 조회할 수 없습니다. v_*_brand 뷰를 쓰세요 (CLAUDE.md 절대 규칙 1).",
});
const BRAND_FORBIDDEN = ["products", "product_costs", "vendors", "settings", "glossary"];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["app/b/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", fromTable(BRAND_FORBIDDEN)] },
  },
  {
    // 브랜드 조회 모듈: 요청·제안 테이블도 뷰로만, 서비스 롤 금지(RLS로만 읽는다)
    files: ["lib/db/brand/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", fromTable([...BRAND_FORBIDDEN, "requests", "request_items", "offers"])],
      "no-restricted-imports": ["error", { paths: [{ name: "@/lib/supabase/admin", message: "lib/db/brand는 사용자 세션(RLS)으로만 읽습니다." }] }],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
