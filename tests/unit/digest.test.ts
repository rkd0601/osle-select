import { describe, it, expect } from "vitest";
import { channelFor, groupDigest, type DigestRow } from "@/lib/digest";

const row = (id: string, p: Partial<DigestRow>): DigestRow => ({
  id, recipient_id: "u1", type: "offer.issued", title: `t${id}`, link_path: "/b/a/offers", entity: null, entity_id: null, created_at: `2026-11-01T0${id}:00:00Z`, ...p,
});

describe("다이제스트 묶음 (PRD 12장: 제안 7개 발행 → 1통)", () => {
  it("같은 대상은 한 줄 + 건수, 최신 제목", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((i) => row(String(i), { entity: "request", entity_id: "r1" }));
    const g = groupDigest(rows).get("u1")!;
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(7);
    expect(g[0].title).toBe("t7");
    expect(g[0].ids).toHaveLength(7);
  });
  it("대상이 없으면 type+링크로 묶고, 수신자·대상이 다르면 나눈다", () => {
    const g = groupDigest([
      row("1", {}), row("2", {}), row("3", { entity: "order", entity_id: "o1" }), row("4", { recipient_id: "u2" }),
    ]);
    expect(g.get("u1")!.map((l) => l.count)).toEqual([2, 1]);
    expect(g.get("u2")!).toHaveLength(1);
  });
  it("채널: CN은 WeCom, 브랜드·ADMIN은 이메일", () => {
    expect(channelFor("CN_SOURCER")).toBe("wecom");
    expect(channelFor("CN_VENDOR")).toBe("wecom");
    expect(channelFor("BRAND_MEMBER")).toBe("email");
    expect(channelFor("ADMIN")).toBe("email");
    expect(channelFor(null)).toBeNull();
  });
});
