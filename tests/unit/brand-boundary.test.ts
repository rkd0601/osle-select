import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * grep 테스트 (CLAUDE.md 절대 규칙 1, ESLint 룰과 이중). 브랜드 측 코드가 원가·원청 테이블을 직접 조회하거나
 * select("*")로 컬럼을 통째로 가져오지 않는지, 금지 키를 다루지 않는지 본다.
 */
const root = path.resolve(__dirname, "../..");
const walk = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []))
    : [];
const brandFiles = [...walk(path.join(root, "app/b")), ...walk(path.join(root, "lib/db/brand"))];
const read = (f: string) => fs.readFileSync(f, "utf8");
const rel = (fs: string[]) => fs.map((f) => path.relative(root, f));

describe("brand boundary", () => {
  it("브랜드 코드가 있다", () => expect(brandFiles.length).toBeGreaterThan(3));

  it("products / product_costs / vendors / settings / glossary 직접 from() 없음", () => {
    const bad = brandFiles.filter((f) => /\.from\(\s*["'](products|product_costs|vendors|settings|glossary)["']\s*\)/.test(read(f)));
    expect(rel(bad)).toEqual([]);
  });

  it("lib/db/brand는 requests/request_items/offers 테이블 대신 뷰만", () => {
    const bad = walk(path.join(root, "lib/db/brand")).filter((f) => /\.from\(\s*["'](requests|request_items|offers)["']\s*\)/.test(read(f)));
    expect(rel(bad)).toEqual([]);
  });

  it("select(\"*\") 없음", () => {
    const bad = brandFiles.filter((f) => /\.select\(\s*["']\*["']/.test(read(f)));
    expect(rel(bad)).toEqual([]);
  });

  it("브랜드 화면이 중국어 원문·원가 키를 읽지 않음", () => {
    const keys = /\b(description_zh|memo_zh|name_zh|desc_zh|cost_cny|hidden_margin_rate|fx_rate|weight_g|vendor_code|booth)\b/;
    const bad = brandFiles.filter((f) => keys.test(read(f)));
    expect(rel(bad)).toEqual([]);
  });
});

describe("id 검증", () => {
  it("zod uuid()(RFC 버전 비트 검사) 대신 guid() — 시드 id(10000000-0000-0000-…)가 거부되면 안 된다", () => {
    const files = [...walk(path.join(root, "app")), ...walk(path.join(root, "lib"))];
    const bad = files.filter((f) => /\.uuid\(\)/.test(read(f)));
    expect(rel(bad)).toEqual([]);
  });
});

describe("클라이언트 번들 예산 (PRD 11장 /cn 초기 JS < 200KB)", () => {
  it("supabase-js 브라우저 클라이언트는 로그인·초대 폼에서만 — 업로드는 lib/storage-upload(fetch)", () => {
    const files = [...walk(path.join(root, "app")), ...walk(path.join(root, "components"))];
    const bad = files.filter((f) => read(f).includes("@/lib/supabase/browser") && !/\(public\)/.test(f));
    expect(rel(bad)).toEqual([]);
  });
});
