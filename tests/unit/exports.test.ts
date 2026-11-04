import { describe, it, expect } from "vitest";
import { buildPackage, packageZip, packageZipName, SHOP_TYPES, SHOPS, type ExportProduct } from "@/lib/exports";
import { OPTION_HEADERS, PRODUCT_HEADERS, SIZE_HEADERS, colorToken, optionRows, productRow, sizeRows, sizeToken, standardFiles } from "@/lib/exports/osle";
import { fromSnapshot, toExportSource, withImages } from "@/lib/exports/source";
import { detailHtml, leaks, snapshotText, toCsv } from "@/lib/exports/common";
import { crc32 } from "@/lib/exports/zip";

const P: ExportProduct = {
  code: "OS-0001", name: "에코퍼 크롭 자켓", category: "아우터", desc: "가벼운 에코퍼\n두 번째 줄", qualityNote: "봉제 마감 깔끔 <확인>",
  fabric: [{ material_code: "polyester", pct: 100 }], origin: "CN", careCodes: ["dry"],
  colors: ["블랙", "아이보리"], sizes: [{ label: "S", measurements: { length: 50, chest: 52, waist: 40 }, source: "measured" }, { label: "M", measurements: { length: 52, chest: 54 }, source: "vendor" }],
  variants: [{ color: "블랙", size: "S" }, { color: "블랙", size: "M" }, { color: "아이보리", size: "S" }, { color: "아이보리", size: "M" }],
  supplyType: "production", leadDays: 12, minQty: 5, verified: true,
  images: ["images/OS-0001_01.jpg", "images/OS-0001_02.jpg"],
};

describe("B-12 쇼핑몰 프리셋 (참고용 초안 4개)", () => {
  it("각 쇼핑몰: 헤더 수 = 행 칸 수, 상품코드·상품명·대표 이미지·상세 파일명이 들어간다, 판매가는 빈 칸", () => {
    for (const shop of SHOP_TYPES) {
      const m = SHOPS[shop];
      const [row] = m.rows(P, "detail/OS-0001.html");
      expect(row.length, shop).toBe(m.headers.length);
      expect(row, shop).toContain("OS-0001");
      expect(row, shop).toContain("에코퍼 크롭 자켓");
      expect(row, shop).toContain("images/OS-0001_01.jpg");
      expect(row.join("|"), shop).toContain("detail/OS-0001.html");
      const price = m.headers.findIndex((h) => h === "판매가");
      expect(row[price], `${shop} 판매가`).toBe("");
      expect(m.version, shop).toMatch(/^\d{4}-\d{2}-draft$/);
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
  it("정상 패키지는 누출 없음 (표준 + 프리셋 전부)", () => {
    expect(buildPackage([P], { presets: SHOP_TYPES }).leak).toBe(false);
  });
  it("중국어 원문·원가 단어가 섞이면 잡는다", () => {
    expect(leaks("涤纶 100%")).toBe(true);
    expect(leaks("cost_cny: 35")).toBe(true);
    expect(leaks("원청 3F-312")).toBe(true);
    expect(buildPackage([{ ...P, name: "仿皮草夹克" }]).leak).toBe(true);
    expect(buildPackage([{ ...P, desc: "vendor 3F" }]).leak).toBe(true);
    expect(leaks("Low COST")).toBe(true);
    expect(leaks('<div style="margin:0 auto;font-weight:600">')).toBe(false);
    expect(leaks("에코퍼 자켓 폴리에스터 100%")).toBe(false);
  });
});

describe("zip (store)", () => {
  it("crc32 표준값", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("로컬 헤더 시그니처·끝 레코드 항목 수·UTF-8 파일명", () => {
    const pkg = buildPackage([P], { presets: ["cafe24"] });
    const z = packageZip(pkg, [{ name: "images/OS-0001_01.jpg", bytes: new Uint8Array([1, 2, 3]) }]);
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    const end = z.byteLength - 22;
    expect(dv.getUint32(end, true)).toBe(0x06054b50);
    expect(dv.getUint16(end + 10, true)).toBe(7); // README + products/options/sizes + detail + presets/cafe24 + image
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

describe("B-12 위아더 표준 패키지 v1 (EXPORT_PACKAGE_SPEC)", () => {
  it("products.csv 20컬럼 고정 순서 (규격 스냅샷)", () => {
    expect(PRODUCT_HEADERS).toEqual([
      "상품코드", "상품명", "카테고리", "판매가", "상품 설명", "소재", "원산지", "세탁 방법", "컬러", "사이즈",
      "옵션 조합 수", "공급 형태", "리드타임(일)", "최소 주문 수량", "실물 확인", "품질 메모", "대표 이미지", "추가 이미지", "상세 HTML", "상세 HTML(인라인)",
    ]);
    expect(OPTION_HEADERS).toEqual(["상품코드", "컬러", "사이즈", "SKU 제안", "판매가", "재고수량"]);
    expect(SIZE_HEADERS).toEqual(["상품코드", "사이즈", "총장", "어깨", "가슴", "소매", "허리", "엉덩이", "밑위", "허벅지", "밑단", "출처"]);
  });
  it("products 행: 판매가 빈 칸, 소재·세탁 / 구분, 이미지 ; 구분, 공급 형태·리드타임·MOQ·실물 확인", () => {
    const r = productRow(P, 4);
    expect(r).toHaveLength(PRODUCT_HEADERS.length);
    const col = (h: string) => r[PRODUCT_HEADERS.indexOf(h)];
    expect(col("판매가")).toBe("");
    expect(col("소재")).toBe("폴리에스터 100%");
    expect(col("세탁 방법")).toBe("드라이클리닝");
    expect(col("컬러")).toBe("블랙, 아이보리");
    expect(col("옵션 조합 수")).toBe("4");
    expect(col("공급 형태")).toBe("생산");
    expect(col("리드타임(일)")).toBe("12");
    expect(col("최소 주문 수량")).toBe("5");
    expect(col("실물 확인")).toBe("예");
    expect(col("대표 이미지")).toBe("images/OS-0001_01.jpg");
    expect(col("추가 이미지")).toBe("images/OS-0001_02.jpg");
    expect(col("상세 HTML")).toBe("detail/OS-0001.html");
    expect(col("상세 HTML(인라인)")).toContain("product-detail");
    expect(productRow({ ...P, supplyType: "stock" }, 0)[PRODUCT_HEADERS.indexOf("리드타임(일)")]).toBe("");
  });
  it("SKU 제안: 사전 영문 → 영문 그대로 → 순번, 사이즈는 영숫자·FREE·순번, 겹치면 -2", () => {
    expect(optionRows(P).map((r) => r[3])).toEqual(["OS-0001-BLACK-S", "OS-0001-BLACK-M", "OS-0001-IVORY-S", "OS-0001-IVORY-M"]);
    expect(colorToken("라이트 그레이", 0)).toBe("LTGRAY");
    expect(colorToken("Pink", 0)).toBe("PINK");
    expect(colorToken("새벽하늘", 2)).toBe("C03");
    expect(sizeToken("260", 0)).toBe("260");
    expect(sizeToken("프리", 0)).toBe("FREE");
    expect(sizeToken("한치수", 1)).toBe("S02");
    const dup = { ...P, colors: ["Black", "블랙"], variants: [{ color: "Black", size: "S" }, { color: "블랙", size: "S" }] };
    expect(optionRows(dup).map((r) => r[3])).toEqual(["OS-0001-BLACK-S", "OS-0001-BLACK-S-2"]);
    expect(optionRows(P).every((r) => r[4] === "" && r[5] === "")).toBe(true);
  });
  it("sizes.csv: 카테고리 템플릿 부위만(아우터에 허리 없음), 출처 라벨", () => {
    const [s, m] = sizeRows(P);
    const col = (r: string[], h: string) => r[SIZE_HEADERS.indexOf(h)];
    expect(col(s, "총장")).toBe("50");
    expect(col(s, "가슴")).toBe("52");
    expect(col(s, "허리")).toBe("");
    expect(col(s, "출처")).toBe("위아더 실측");
    expect(col(m, "출처")).toBe("제공 사이즈표");
    expect(col(sizeRows({ ...P, category: "가방" })[0], "허리")).toBe("40"); // 템플릿 없는 카테고리는 있는 값 그대로
  });
  it("README: 대응표 4곳·빠진 사진 목록·프리셋 안내, 파일 구성", () => {
    const files = standardFiles([P], { presets: ["godo"], missingPhotos: [{ code: "OS-0001", n: 1 }], date: "2026-11-02" });
    expect(files.map((f) => f.name)).toEqual(["README.txt", "products.csv", "options.csv", "sizes.csv", "detail/OS-0001.html"]);
    const r = files[0].text;
    for (const s of ["카페24", "고도몰", "아임웹", "스마트스토어"]) expect(r).toContain(s);
    expect(r).toContain("OS-0001: 1장");
    expect(r).toContain("presets/");
    expect(r).toContain("2026-11-02");
    expect(packageZipName("acme", "2026-11-02")).toBe("osle_package_acme_20261102.zip");
  });
  it("원본 변환: 뷰 행·스냅샷 같은 모양, 사진은 성공한 수만큼 .jpg", () => {
    const s = toExportSource(
      { id: "p1", code: "OS-1", name_ko: "자켓", category: "아우터", desc_ko: null, quality_note_ko: null, fabric: [{ material_code: "cotton", pct: 100 }], origin: "CN", care_codes: ["dry"], supply_type: "stock", lead_days: null, min_qty: 1, verified_in_person: true },
      { colors: [{ id: "c1", product_id: "p1", name_ko: "블랙" }], sizes: [{ id: "s1", product_id: "p1", label: "M", measurements: { length: 60 }, source: "measured" }], variants: [{ product_id: "p1", color_id: "c1", size_id: "s1" }], images: [{ product_id: "p1", storage_path: "a.webp" }, { product_id: "p2", storage_path: "b.webp" }] },
    );
    expect(s.photoPaths).toEqual(["a.webp"]);
    expect(s.base.variants).toEqual([{ color: "블랙", size: "M" }]);
    expect(Object.keys(s.base)).not.toContain("weight_g");
    expect(withImages(s, 1).images).toEqual(["images/OS-1_01.jpg"]);
    expect(fromSnapshot("p1", { base: s.base, photoPaths: s.photoPaths })).toEqual(s);
    expect(fromSnapshot("p1", { nope: 1 })).toBeNull();
  });
  it("고정 문구 키(템플릿 키 포함)가 ko 사전에 있다", async () => {
    const ko = (await import("@/lib/i18n/ko.json")).default as Record<string, string>;
    for (const k of ["stock", "production", "mixed"]) expect(ko[`export.pkg.supply.${k}`], k).toBeTruthy();
    for (const k of ["measured", "vendor"]) expect(ko[`export.pkg.sizeSource.${k}`], k).toBeTruthy();
    for (const k of ["cafe24", "godo", "imweb", "smartstore"]) expect(ko[`export.pkg.readme.map.${k}`], k).toBeTruthy();
    for (const k of ["osle", ...SHOP_TYPES]) expect(ko[`export.shop.${k}`], k).toBeTruthy();
  });
});

describe("스냅샷 금지어 검사 (검증 D-1)", () => {
  it("sizes[].source 출처 enum('vendor')은 금지어가 아니다 — 원청 사이즈표 상품도 스냅샷된다", () => {
    const base = { code: "OS-26FW-0001", name_ko: "코트", sizes: [{ label: "M", source: "vendor", measurements: { chest: 50 } }] };
    expect(leaks(JSON.stringify(base))).toBe(true); // 그대로 검사하면 걸린다(버그였던 경로)
    expect(leaks(snapshotText(base))).toBe(false);
  });
  it("본문에 섞인 원가·중국어·vendor 단어는 여전히 걸린다", () => {
    expect(leaks(snapshotText({ desc_ko: "원청 직송", sizes: [{ source: "vendor" }] }))).toBe(true);
    expect(leaks(snapshotText({ desc_ko: "面料", sizes: [] }))).toBe(true);
    expect(leaks(snapshotText({ note: "vendor said ok" }))).toBe(true);
    expect(leaks(snapshotText({ note: "made by vendors" }))).toBe(true);
  });
});
