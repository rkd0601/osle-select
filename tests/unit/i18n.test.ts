import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ko from "@/lib/i18n/ko.json";
import zh from "@/lib/i18n/zh-CN.json";

/**
 * i18n 키 누락 방지 (CLAUDE.md 규칙 10). 코드의 리터럴 키 tk("x") / t(L, "x")가 사전에 있는지 본다.
 * /cn 화면(app/cn/**)에서 쓰는 키는 zh-CN에도 있어야 한다. 템플릿 리터럴 키(`status.${s}`)는 각 테스트가 따로 본다.
 */
const root = path.resolve(__dirname, "../..");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
const KEY = /\b(?:tk|t)\(\s*(?:[A-Za-z_.]+,\s*)?"([a-z][\w.]*\.[\w.]+)"/g;
const keysIn = (f: string) => [...fs.readFileSync(f, "utf8").matchAll(KEY)].map((m) => m[1]);
const K = ko as Record<string, string>;
const Z = zh as Record<string, string>;

describe("i18n keys", () => {
  const files = [...walk(path.join(root, "app")), ...walk(path.join(root, "components")), ...walk(path.join(root, "lib"))];
  it("코드에 쓰인 리터럴 키는 ko에 있다", () => {
    const missing = files.flatMap((f) => keysIn(f).filter((k) => !K[k]).map((k) => `${path.relative(root, f)}: ${k}`));
    expect(missing).toEqual([]);
  });
  it("/cn 화면 키는 zh-CN에도 있다", () => {
    const cn = files.filter((f) => f.includes(`${path.sep}app${path.sep}cn${path.sep}`));
    const missing = cn.flatMap((f) => keysIn(f).filter((k) => !Z[k]).map((k) => `${path.relative(root, f)}: ${k}`));
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
  it("상품 상태 라벨 ko·zh", async () => {
    const { PRODUCT_STATUS } = await import("@/lib/transitions");
    for (const s of PRODUCT_STATUS) {
      expect(K[`status.product.${s}`], s).toBeTruthy();
      expect(Z[`status.product.${s}`], s).toBeTruthy();
    }
  });
});
