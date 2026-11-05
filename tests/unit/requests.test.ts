import { describe, it, expect } from "vitest";
import {
  aggregateRequestStatus, itemStatusAfterReactions, isOwnRequestImagePath, requestImagePath, requestTitle, slaDateToDue,
  NEEDS_INFO_REASONS, RequestInput, HttpUrl,
  mergeStyleNotes, splitPastedUrls, styleIssue, hasBatchim, shortName, pickItemCards, itemPhase, phaseCounts,
} from "@/lib/requests";
import { canTransition, allowedNext, REQUEST_ITEM_STATUS } from "@/lib/transitions";
import { ownerAndDue } from "@/lib/sla";
import { targetCostCny, productPriceKrw, supplyPriceKrw } from "@/lib/pricing";
import { ADMIN_DICTS } from "@/lib/i18n/admin";
const ko = ADMIN_DICTS.ko;
const zh = ADMIN_DICTS["zh-CN"];

type S = (typeof REQUEST_ITEM_STATUS)[number];
const st = (...s: S[]) => s.map((status) => ({ status }));

describe("aggregateRequestStatus", () => {
  it("브랜드 차례가 최우선", () => expect(aggregateRequestStatus(st("offered", "needs_info", "sourcing"))).toBe("needs_info"));
  it("제안 도착 > 찾는 중 > 접수", () => {
    expect(aggregateRequestStatus(st("offered", "sourcing", "received"))).toBe("offered");
    expect(aggregateRequestStatus(st("assigned", "received"))).toBe("sourcing");
    expect(aggregateRequestStatus(st("received", "cancelled"))).toBe("received");
  });
  it("전부 취소면 취소, 종료+취소면 종료, 보류만 남으면 보류", () => {
    expect(aggregateRequestStatus(st("cancelled", "cancelled"))).toBe("cancelled");
    expect(aggregateRequestStatus(st("closed", "cancelled"))).toBe("closed");
    expect(aggregateRequestStatus(st("on_hold", "closed"))).toBe("on_hold");
    expect(aggregateRequestStatus([])).toBe("cancelled");
  });
});

describe("itemStatusAfterReactions (PRD 12: 모두 거절 시 sourcing 복귀)", () => {
  it("전부 거절 → sourcing", () => expect(itemStatusAfterReactions("offered", [{ status: "declined" }, { status: "declined" }])).toBe("sourcing"));
  it("만료는 제외하고 판단", () => expect(itemStatusAfterReactions("offered", [{ status: "declined" }, { status: "expired" }])).toBe("sourcing"));
  it("관심 하나 → selected", () => expect(itemStatusAfterReactions("offered", [{ status: "declined" }, { status: "interested" }])).toBe("selected"));
  it("미반응 섞이면 그대로", () => expect(itemStatusAfterReactions("offered", [{ status: "declined" }, { status: "new" }])).toBeNull());
  it("offered 이전 상태는 건드리지 않음", () => expect(itemStatusAfterReactions("sourcing", [{ status: "declined" }])).toBeNull());
  it("모두 거절로 sourcing에 돌아간 뒤 다시 관심 → offered (그다음 selected)", () => {
    expect(itemStatusAfterReactions("sourcing", [{ status: "declined" }, { status: "interested" }])).toBe("offered");
    expect(itemStatusAfterReactions("offered", [{ status: "declined" }, { status: "interested" }])).toBe("selected");
    expect(canTransition("request_item", "sourcing", "offered", "ADMIN")).toBe(true);
  });
  it("배정 전 상태는 건드리지 않음", () => expect(itemStatusAfterReactions("assigned", [{ status: "interested" }])).toBeNull());
  it("결과 전이는 전이 테이블에 있음", () => {
    expect(canTransition("request_item", "offered", "sourcing", "ADMIN")).toBe(true);
    expect(canTransition("request_item", "offered", "selected", "ADMIN")).toBe(true);
  });
});

describe("request_item 전이·SLA (3단계 흐름)", () => {
  it("접수 → 보완 요청 → 브랜드 보완 → 배정 → CN 시작", () => {
    expect(canTransition("request_item", "received", "needs_info", "ADMIN")).toBe(true);
    expect(canTransition("request_item", "needs_info", "received", "BRAND_MEMBER")).toBe(true);
    expect(canTransition("request_item", "received", "assigned", "ADMIN")).toBe(true);
    expect(canTransition("request_item", "assigned", "sourcing", "CN_SOURCER")).toBe(true);
  });
  it("브랜드·CN은 배정·보완 요청 불가, 브랜드는 배정된 항목을 취소할 수 없다", () => {
    expect(canTransition("request_item", "received", "assigned", "BRAND_OWNER")).toBe(false);
    expect(canTransition("request_item", "received", "needs_info", "CN_SOURCER")).toBe(false);
    expect(canTransition("request_item", "assigned", "cancelled", "BRAND_OWNER")).toBe(false);
    expect(allowedNext("request_item", "assigned", "BRAND_OWNER")).toEqual([]);
  });
  it("received는 ADMIN 1영업일, needs_info는 BRAND, assigned는 CN sla_date", () => {
    const fri = new Date("2026-11-06T03:00:00Z"); // 금요일
    const r = ownerAndDue("request_item", "received", fri);
    expect(r.owner_role).toBe("ADMIN");
    expect(r.due_at!.getUTCDay()).toBe(1); // 월요일
    expect(ownerAndDue("request_item", "needs_info", fri).owner_role).toBe("BRAND");
    const due = slaDateToDue("2026-11-10");
    expect(ownerAndDue("request_item", "assigned", fri, undefined, { sla_date: due })).toEqual({ owner_role: "CN", due_at: due });
    expect(due.toISOString()).toBe("2026-11-10T15:59:59.000Z");
  });
});

describe("RequestInput (B-02 필수: 사진/링크 1 + 한 줄)", () => {
  const brand = "10000000-0000-0000-0000-000000000001";
  const p = requestImagePath(brand, "6f1c2b9e-1111-4a5b-9c8d-123456789abc", new Date("2026-11-01T00:00:00Z"));
  it("경로 형식과 브랜드 prefix", () => {
    expect(p).toBe(`${brand}/202611/6f1c2b9e-1111-4a5b-9c8d-123456789abc.webp`);
    expect(isOwnRequestImagePath(brand, p)).toBe(true);
    expect(isOwnRequestImagePath("20000000-0000-0000-0000-000000000002", p)).toBe(false);
    expect(isOwnRequestImagePath(brand, `${brand}/../other/x.webp`)).toBe(false);
  });
  it("사진·링크 둘 다 없으면 거부", () => {
    const r = RequestInput.safeParse({ items: [{ description: "에코퍼 자켓" }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("request.error.needImageOrLink");
  });
  it("링크만 / 사진만 통과, http(s)만 허용", () => {
    expect(RequestInput.safeParse({ items: [{ description: "x", links: ["https://item.taobao.com/1"] }] }).success).toBe(true);
    expect(RequestInput.safeParse({ items: [{ description: "x", imagePaths: [p] }] }).success).toBe(true);
    expect(RequestInput.safeParse({ items: [{ description: "x", links: ["javascript:alert(1)"] }] }).success).toBe(false);
  });
  it("빈 설명·항목 0개 거부, 제목 비면 첫 항목 설명", () => {
    expect(RequestInput.safeParse({ items: [{ description: " ", links: ["https://a.b"] }] }).success).toBe(false);
    expect(RequestInput.safeParse({ items: [] }).success).toBe(false);
    const parsed = RequestInput.parse({ title: "", items: [{ description: "롱 코트", links: ["https://a.b"] }] });
    expect(requestTitle(parsed)).toBe("롱 코트");
  });
});

describe("targetCostCny (CN_SOURCER 목표 진가)", () => {
  const ctx = { fx_rate: 200, hidden_margin_rate: 0.2, fee_rate: 0.2 };
  it("공급가 → 원가 역산, 0.1위안 내림", () => {
    expect(targetCostCny(20000, ctx)).toBe(69.4); // 20000/1.2/1.2/200 = 69.44
    expect(targetCostCny(0, ctx)).toBe(0);
  });
  it("역산한 원가로 다시 계산하면 희망 공급가 이하", () => {
    const c = targetCostCny(21090, ctx);
    expect(supplyPriceKrw(productPriceKrw(c, ctx), ctx.fee_rate)).toBeLessThanOrEqual(21090);
  });
});

describe("i18n 템플릿 키 (CLAUDE.md 규칙 10)", () => {
  const K = ko as Record<string, string>;
  const Z = zh as Record<string, string>;
  it("요청 항목 상태 라벨 ko·zh 전부", () => {
    for (const s of REQUEST_ITEM_STATUS) {
      expect(K[`status.request_item.${s}`], s).toBeTruthy();
      expect(Z[`status.request_item.${s}`], s).toBeTruthy();
    }
  });
  it("B-03 핸드오프 카드 키 (요청 집계 상태 그대로 키에 쓴다)", () => {
    for (const s of ["needs_info", "offered", "sourcing", "received"]) {
      expect(K[`handoff.request.${s}.title`], s).toBeTruthy(); // lib/handoff 템플릿 키
      expect(K[`handoff.request.${s}.decide`], s).toBeTruthy();
    }
  });
  it("CN 화면 키는 ko에도 있다 (ADMIN이 /cn을 볼 때)", () => {
    for (const k of Object.keys(Z).filter((k) => k.startsWith("cn.item."))) expect(K[k], k).toBeTruthy();
  });
  it("보완 요청 사유 템플릿 전부", () => {
    for (const r of NEEDS_INFO_REASONS) expect(K[`needsInfo.reason.${r}`]).toBeTruthy();
  });
});

// Cowork 리뷰(docs/REVIEW_2026-11-01.md)에서 추가한 경계 케이스
describe("requests — review cases", () => {
  it("배정 + 종료 → sourcing, 접수 + 보류 → received", () => {
    expect(aggregateRequestStatus(st("assigned", "closed"))).toBe("sourcing");
    expect(aggregateRequestStatus(st("received", "on_hold"))).toBe("received");
  });
  it("만료만 남으면 그대로, 만료 + 미반응도 그대로", () => {
    expect(itemStatusAfterReactions("offered", [{ status: "expired" }])).toBeNull();
    expect(itemStatusAfterReactions("offered", [{ status: "expired" }, { status: "new" }])).toBeNull();
  });
  it("ftp·javascript·data 링크 거부 (HttpUrl은 보완 응답에도 쓴다)", () => {
    expect(RequestInput.safeParse({ items: [{ description: "x", links: ["ftp://bad"] }] }).success).toBe(false);
    for (const u of ["javascript:alert(1)", "data:text/html,x", "JAVASCRIPT:alert(1)"]) expect(HttpUrl.safeParse(u).success, u).toBe(false);
    expect(HttpUrl.safeParse("HTTPS://item.taobao.com/x").success).toBe(true);
  });
});

describe("요청 작성 v2.3 — 스타일 메모·붙여넣기·검증", () => {
  it("스타일 메모는 전체 메모 뒤에 [스타일 n] 줄로, 빈 메모는 건너뛴다", () => {
    expect(mergeStyleNotes("26 F/W 2차 · 납기 12월", [{ note: "베이지 우선, S~L" }, { note: "" }, { note: " 울 70%\n이상 " }]))
      .toBe("26 F/W 2차 · 납기 12월\n[스타일 1] 베이지 우선, S~L\n[스타일 3] 울 70% 이상");
    expect(mergeStyleNotes("", [{ note: "블랙" }])).toBe("[스타일 1] 블랙");
    expect(mergeStyleNotes(null, [{}, { note: null }])).toBe("");
  });
  it("RequestInput은 저장용 memo에 스타일 메모를 합친다, 메모 300자 초과 거부", () => {
    const v = RequestInput.parse({ memo: "전체", items: [{ description: "자켓", links: ["https://a.b/1"], note: "S~L" }, { description: "코트", links: ["https://a.b/2"] }] });
    expect(v.memo).toBe("전체\n[스타일 1] S~L");
    expect(RequestInput.safeParse({ items: [{ description: "x", links: ["https://a.b"], note: "가".repeat(301) }] }).success).toBe(false);
  });
  it("붙여넣은 글에서 http(s) 링크만, 공백·줄바꿈 구분, 중복 제거", () => {
    expect(splitPastedUrls("https://www.instagram.com/p/1\nhttps://item.taobao.com/2  보세요 https://www.instagram.com/p/1, ftp://x")).toEqual([
      "https://www.instagram.com/p/1", "https://item.taobao.com/2",
    ]);
    expect(splitPastedUrls("링크 없음")).toEqual([]);
  });
  it("처음 걸리는 스타일 번호와 이유", () => {
    expect(styleIssue([{ description: "자켓", imageCount: 1, links: [] }, { description: "코트", imageCount: 0, links: [" "] }])).toEqual({ n: 2, kind: "source" });
    expect(styleIssue([{ description: " ", imageCount: 0, links: ["https://a.b"] }])).toEqual({ n: 1, kind: "desc" });
    expect(styleIssue([{ description: "x", imageCount: 0, links: ["instagram 링크"] }])).toEqual({ n: 1, kind: "link" });
    expect(styleIssue([{ description: "x", imageCount: 2, links: ["", "https://a.b"] }])).toBeNull();
  });
});

describe("요청 상세 지금 문장 (3차 검증 T2)", () => {
  type C = { requestItemId: string; kind: "request" | "offer" | "sample" | "order"; stage: number; done: boolean; stateKey: string };
  const c = (requestItemId: string, kind: C["kind"], stage: number, stateKey: string, done = false): C => ({ requestItemId, kind, stage, done, stateKey });
  it("항목마다 진행 중 → 단계 높은 → 발주 > 샘플 > 제안 순으로 한 장", () => {
    const m = pickItemCards([
      c("a", "offer", 2, "state.offer.interested"), c("a", "sample", 3, "state.sample.feedback_done"), c("a", "order", 4, "state.order.quoted"),
      c("b", "request", 1, "state.request.sourcing"),
      c("d", "offer", 5, "state.offer.declined", true), c("d", "offer", 2, "state.offer.new"),
      c("e", "sample", 4, "state.sample.return_due"), c("e", "order", 4, "state.order.confirmed"),
    ]);
    expect(m.get("a")!.kind).toBe("order");
    expect(m.get("b")!.kind).toBe("request");
    expect(m.get("d")!.stateKey).toBe("state.offer.new");
    expect(m.get("e")!.kind).toBe("order");
  });
  it("요청 상세 요약: 스타일마다 가장 진행된 상태 하나만 센다 (7차 W5)", () => {
    const items = [{ id: "1", status: "assigned" }, { id: "2", status: "received" }, { id: "3", status: "selected" }];
    // 3번은 관심 제안·샘플 카드가 함께 있다 → 샘플 하나로만. 같은 항목 id가 두 번 와도 한 번
    const cards = [c("1", "request", 1, "state.request.assigned"), c("2", "request", 1, "state.request.received"),
      c("3", "offer", 2, "state.offer.interested"), c("3", "sample", 3, "state.sample.requested")];
    const r = phaseCounts([...items, items[2]], cards);
    expect(r).toEqual([["sourcing", 1], ["checking", 1], ["sample", 1]]);
    expect(r.reduce((n, [, k]) => n + k, 0)).toBe(items.length);
    // 카드가 없는 항목은 항목 상태로
    expect(phaseCounts([{ id: "x", status: "received" }], [])).toEqual([["checking", 1]]);
  });
  it("단계 말 키는 전부 사전에 있다", () => {
    const K = ko as Record<string, string>;
    const cards = [
      ...["received", "needs_info", "assigned", "sourcing", "on_hold", "offered", "selected", "closed", "cancelled"].map((s) => c("x", "request", 1, `state.request.${s}`)),
      ...["new", "reconsent", "interested", "hold", "declined", "expired"].map((s) => c("x", "offer", 2, `state.offer.${s}`)),
      c("x", "sample", 3, "state.sample.delivered"), c("x", "sample", 3, "state.sample.returned", true),
      c("x", "order", 4, "state.order.quoted"), c("x", "order", 5, "state.order.report_done", true),
    ];
    for (const x of cards) expect(K[`request.detail.phase.${itemPhase(x)}`], x.stateKey).toBeTruthy();
    expect(itemPhase(c("x", "order", 4, "state.order.quoted"))).toBe("order");
    expect(itemPhase(c("x", "request", 1, "state.request.sourcing"))).toBe("sourcing");
  });
  it("은/는 받침, 짧은 이름", () => {
    expect(hasBatchim("자켓")).toBe(true); // "자켓은"
    expect(hasBatchim("롱 코트")).toBe(false);
    expect(hasBatchim("가디건")).toBe(true);
    expect(hasBatchim("오버핏)")).toBe(true); // 닫는 괄호는 건너뛴다
    expect(hasBatchim("OS-26FW-0002")).toBe(false);
    expect(hasBatchim(shortName("울 니트 가디건 (오버핏)"))).toBe(true);
    expect(shortName("울 니트 가디건 (오버핏)")).toBe("울 니트 가디건");
    expect(shortName("에코퍼 크롭 자켓 카라 넓은 것")).toBe("에코퍼 크롭 자켓");
  });
});
