import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * 접근성 정적 검사 (11단계). 화면 코드의 input·select·textarea는 레이블이 있어야 한다:
 * <label> 안이거나 aria-label·aria-labelledby·id(htmlFor 짝)가 있거나 숨김(hidden·type=hidden·file·aria-hidden).
 * 아이콘만 있는 × 버튼은 aria-label이 있어야 한다. 정규식 근사 검사 — 예외는 ALLOW에 이유와 함께.
 */
const root = path.resolve(__dirname, "../..");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".tsx") ? [path.join(dir, e.name)] : []));
const files = [...walk(path.join(root, "app")), ...walk(path.join(root, "components"))];
// num() 헬퍼 — 호출부가 모두 <label> 안 (app/cn/products/[id]/editor.tsx)
const ALLOW = [/const num = \(k: keyof typeof f\) => \(\s*$/];

function tagAt(s: string, start: number) {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return s.slice(start, i + 1);
  }
  return s.slice(start);
}

describe("접근성 정적 검사", () => {
  it("폼 컨트롤은 모두 레이블이 있다", () => {
    const missing: string[] = [];
    for (const f of files) {
      const s = fs.readFileSync(f, "utf8");
      for (const m of s.matchAll(/<(input|select|textarea)\b/g)) {
        const tag = tagAt(s, m.index!);
        if (/type="hidden"|type="file"|aria-hidden|aria-label|aria-labelledby|\bid=|\bhidden\b/.test(tag)) continue;
        const before = s.slice(0, m.index);
        if ((before.match(/<label/g) ?? []).length > (before.match(/<\/label>/g) ?? []).length) continue;
        const lineStart = before.lastIndexOf("\n", before.length - 2);
        const prevLine = before.slice(before.lastIndexOf("\n", lineStart - 1) + 1, lineStart + 1);
        if (ALLOW.some((r) => r.test(prevLine) || r.test(before.slice(lineStart + 1)))) continue;
        missing.push(`${path.relative(root, f)}:${before.split("\n").length}`);
      }
    }
    expect(missing).toEqual([]);
  });
  it("× 아이콘 버튼은 접근 이름이 있다", () => {
    const bad = files.flatMap((f) =>
      fs.readFileSync(f, "utf8").split("\n").flatMap((l, i) => (/<button[^>]*>(×|\{labels\.remove\})<\/button>/.test(l) && !/aria-label/.test(l) ? [`${path.relative(root, f)}:${i + 1}`] : [])),
    );
    expect(bad).toEqual([]);
  });
});
