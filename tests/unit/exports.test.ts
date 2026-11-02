import { describe, it, expect } from "vitest";
import { buildPackage, packageZip, SHOP_TYPES, SHOPS, type ExportProduct } from "@/lib/exports";
import { detailHtml, leaks, toCsv } from "@/lib/exports/common";
import { crc32 } from "@/lib/exports/zip";

const P: ExportProduct = {
  code: "OS-0001", name: "에코퍼 크롭 자켓", category: "아우터", desc: "가벼운 에코퍼\n두 번째 줄", qualityNote: "봉제 마감 깔끔 <확인>",
  fabric: [{ material_code: "polyester", pct: 100 }], origin: "CN", careCodes: ["dry"],
  colors: ["블랙", "아이보리"], sizes: [{ label: "S", measurements: { length: 50, chest: 52 } }, { label: "M", measurements: { length: 52, chest: 54 } }],
  variants: [{ color: "블랙", size: "S" }, { color: "블랙", size: "M" }, { color: "아이보리", size: "S" }, { color: "아이보리", size: "M" }],
  images: ["images/OS-0001_01.webp", "images/OS-0001_02.webp"],
};

describe("B-12 쇼핑몰 매핑 (4개)", () => {
  it("각 쇼핑몰: 헤더 수 = 행 칸 수, 상품코드·상품명·대표 이미지·상세 파일명이 들어간다, 판매가는 빈 칸", () => {
    for (const shop of SHOP_TYPES) {
      const m = SHOPS[shop];
      const [row] = m.rows(P, "detail/OS-0001.html");
      expect(row.length, shop).toBe(m.headers.length);
      expect(row, shop).toContain("OS-0001");
      expect(row, shop).toContain("에코퍼 크롭 자켓");
      expect(row, shop).toContain("images/OS-0001_01.webp");
      expect(row.join("|"), shop).toContain("detail/OS-0001.html");
      const price = m.headers.findIndex((h) => h === "판매가");
      expect(row[price], `${shop} 판매가`).toBe("");
      expect(m.version, shop).toMatch(/^\d{4}-\d{2}/);
    }
  });
  it("옵션 형식: 카페24 조합형, 고도몰 variant 나열, 아임웹, 스마트스토어 조합형", () => {
    expect(SHOPS.cafe24.rows(P, "d")[0]).toContain("색상{블랙|아이보리}//사이즈{S|M}");
    expect(SHOPS.godo.rows(P, "d")[0]).toContain("블랙^|^S@블랙^|^M@아이보리^|^S@아이보리^|^M");
    expect(SHOPS.imweb.rows(P, "d")[0]).toContain("색상:블랙,아이보리/사이즈:S,M");
    const ss = SHOPS.smartstore.rows(P, "d")[0];
    expect(ss).toContain("조합형");
    expect(ss).toContain("블랙,아이보리\nS,M");
  });
  it("옵션 없는 상품은 옵션 사용 안 함", () => {
    const one = { ...P, colors: [], sizes: [], variants: [] };
    expect(SHOPS.cafe24.rows(one, "d")[0][5]).toBe("N");
    expect(SHOPS.godo.rows(one, "d")[0][4]).toBe("n");
  });
});

describe("상세 HTML·CSV", () => {
  it("혼용률·세탁·원산지·사이즈표를 한국어로 삽입하고 이스케이프한다", () => {
    const h = detailHtml(P);
    expect(h).toContain("폴리에스터 100%");
    expect(h).toContain("드라이클리닝");
    expect(h).toContain("중국");
    expect(h).toContain("총장");
    expect(h).toContain("&lt;확인&gt;");
    expect(h).not.toContain("<확인>");
  });
  it("CSV: BOM·CRLF·따옴표 이스케이프", () => {
    const c = toCsv(["a", "b"], [["x,y", 'say "hi"'], ["줄\n바꿈", ""]]);
    expect(c.startsWith("﻿")).toBe(true);
    expect(c).toContain('"x,y","say ""hi"""');
    expect(c).toContain('"줄\n바꿈",');
    expect(c.endsWith("\r\n")).toBe(true);
  });
});

describe("원가·원청·중국어 누출 없음 (절대 규칙 1)", () => {
  it("정상 패키지는 누출 없음", () => {
    for (const shop of SHOP_TYPES) expect(buildPackage(shop, [P]).leak, shop).toBe(false);
  });
  it("중국어 원문·원가 단어가 섞이면 잡는다", () => {
    expect(leaks("涤纶 100%")).toBe(true);
    expect(leaks("cost_cny: 35")).toBe(true);
    expect(leaks("원청 3F-312")).toBe(true);
    expect(buildPackage("cafe24", [{ ...P, name: "仿皮草夹克" }]).leak).toBe(true);
    expect(leaks("에코퍼 자켓 폴리에스터 100%")).toBe(false);
  });
});

describe("zip (store)", () => {
  it("crc32 표준값", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("로컬 헤더 시그니처·끝 레코드 항목 수·UTF-8 파일명", () => {
    const pkg = buildPackage("cafe24", [P]);
    const z = packageZip(pkg, [{ name: "images/OS-0001_01.webp", bytes: new Uint8Array([1, 2, 3]) }]);
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    const end = z.byteLength - 22;
    expect(dv.getUint32(end, true)).toBe(0x06054b50);
    expect(dv.getUint16(end + 10, true)).toBe(3); // csv + detail + image
    expect(new TextDecoder().decode(z)).toContain("detail/OS-0001.html");
  });
});

describe("exports r7 — CSV 수식 주입", () => {
  it("= + - @ 로 시작하는 셀은 작은따옴표로 막는다", async () => {
    const { toCsv } = await import("@/lib/exports/common");
    const csv = toCsv(["a", "b"], [["=HYPERLINK(\"x\")", "+1"], ["-2", "@cmd"]]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"'+1"`);
    expect(csv).toContain(`"'-2"`);
    expect(csv).toContain(`"'@cmd"`);
    expect(csv).not.toMatch(/\r\n=/);
  });
});
