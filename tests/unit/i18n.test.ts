import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BASE } from "@/lib/i18n";
import { CN_DICTS } from "@/lib/i18n/cn";
import { ADMIN_DICTS } from "@/lib/i18n/admin";

/**
 * i18n 키 누락 방지 (CLAUDE.md 규칙 10). 코드의 리터럴 키 tk("x") / t(L, "x")가 사전에 있는지 본다.
 * /cn 화면(app/cn/**)에서 쓰는 키는 zh-CN에도 있어야 한다. 템플릿 리터럴 키(`status.${s}`)는 각 테스트가 따로 본다.
 */
const root = path.resolve(__dirname, "../..");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
const KEY = /\b(?:tk|t)\(\s*(?:[A-Za-z_.]+,\s*)?"([a-z][\w.]*\.[\w.]+)"/g;
const keysIn = (f: string) => [...fs.readFileSync(f, "utf8").matchAll(KEY)].map((m) => m[1]);
const K = ADMIN_DICTS.ko; // 상태·템플릿 키 검사용(전체)
const Z = ADMIN_DICTS["zh-CN"];
const sep = path.sep;
/** 파일 영역 → 그 영역 사전 (11단계 분리: 브랜드·공통 코드는 관리자·cn 키를 쓸 수 없다) */
const dictFor = (f: string) => (f.includes(`${sep}app${sep}admin${sep}`) ? ADMIN_DICTS : f.includes(`${sep}app${sep}cn${sep}`) ? CN_DICTS : BASE);

describe("i18n keys", () => {
  const files = [...walk(path.join(root, "app")), ...walk(path.join(root, "components")), ...walk(path.join(root, "lib"))];
  it("코드에 쓰인 리터럴 키는 ko에 있다", () => {
    const missing = files.flatMap((f) => keysIn(f).filter((k) => !dictFor(f).ko[k]).map((k) => `${path.relative(root, f)}: ${k}`));
    expect(missing).toEqual([]);
  });
  it("/cn 화면 키는 zh-CN에도 있다", () => {
    const cn = files.filter((f) => f.includes(`${path.sep}app${path.sep}cn${path.sep}`));
    const missing = cn.flatMap((f) => keysIn(f).filter((k) => !CN_DICTS["zh-CN"][k]).map((k) => `${path.relative(root, f)}: ${k}`));
    expect(missing).toEqual([]);
  });
  it("공개 조건 체크 라벨 ko·zh (product.check.<key>)", async () => {
    const { publishChecks } = await import("@/lib/transitions");
    const keys = publishChecks({
      verified_in_person: true, photo_count: 5, has_real_photo: true, sample_ok: true, fabric_pct_sum: 100, origin: "CN", care_codes: ["dry"], min_qty: 1, weight_g: 1,
      hold_resolved: true, supply_type: "stock", vendor_id: "v", color_count: 1, size_count: 1, cost_tier_count: 1, lead_days: null, production_moq: null,
    }).map((c) => c.key);
    for (const k of keys) {
      expect(K[`product.check.${k}`], k).toBeTruthy();
      expect(Z[`product.check.${k}`], k).toBeTruthy();
    }
  });
  it("샘플 상태·불량 템플릿 라벨 ko·zh (CN 큐·A-05)", async () => {
    const { SAMPLE_REQUEST_STATUS } = await import("@/lib/transitions");
    const { SAMPLE_DEFECTS } = await import("@/lib/samples");
    for (const s of SAMPLE_REQUEST_STATUS) {
      expect(K[`status.sample_request.${s}`], s).toBeTruthy();
      expect(Z[`status.sample_request.${s}`], s).toBeTruthy();
    }
    for (const d of SAMPLE_DEFECTS) {
      expect(K[`sample.defect.${d}`], d).toBeTruthy();
      expect(Z[`sample.defect.${d}`], d).toBeTruthy();
    }
  });
  it("상품 상태 라벨 ko·zh", async () => {
    const { PRODUCT_STATUS } = await import("@/lib/transitions");
    for (const s of PRODUCT_STATUS) {
      expect(K[`status.product.${s}`], s).toBeTruthy();
      expect(Z[`status.product.${s}`], s).toBeTruthy();
    }
  });
});

describe("사전 영역 분리 (11단계 — 내부 문구가 브랜드·원청 번들에 실리지 않게)", () => {
  // 원가·원청 편집 문구는 cn 사전으로 (DECISIONS r9-2) — 브랜드 번들에 내부 용어가 실리지 않게
  const SENSITIVE = /숨은 마진|녹인 마진|hidden margin|1위안 = 원|目标进价|원가|成本|原价/;
  it("공통 사전에는 관리자·cn 키와 내부 용어가 없다", () => {
    for (const L of ["ko", "zh-CN"] as const) {
      const keys = Object.keys(BASE[L]);
      expect(keys.filter((k) => /^(admin|audit|glossary|issue|measure|needsInfo|settings|cn)\./.test(k)), L).toEqual([]);
      expect(Object.entries(BASE[L]).filter(([, v]) => SENSITIVE.test(v)).map(([k]) => k), L).toEqual([]);
    }
  });
  it("cn 사전에도 관리자 키는 없다 (CN_VENDOR = 외부 계정)", () => {
    expect(Object.keys(CN_DICTS.ko).filter((k) => /^(admin|settings|issue|audit)\./.test(k))).toEqual([]);
  });
  it("관리자·cn 사전 모듈은 해당 영역에서만 import 한다", () => {
    const all = ["app", "components", "lib", "emails"].flatMap((d) => walk(path.join(root, d)));
    const bad = all.flatMap((f) => {
      const s = fs.readFileSync(f, "utf8");
      const out: string[] = [];
      if (/from "@\/lib\/i18n\/admin"/.test(s) && !f.includes(`${sep}app${sep}admin${sep}`)) out.push(`${path.relative(root, f)}: admin`);
      if (/from "@\/lib\/i18n\/cn"/.test(s) && !f.includes(`${sep}app${sep}cn${sep}`) && !f.includes(`${sep}app${sep}admin${sep}`)) out.push(`${path.relative(root, f)}: cn`);
      return out;
    });
    expect(bad).toEqual([]);
  });
});
