import { afterEach, describe, expect, it, vi } from "vitest";
import { newUuid } from "@/lib/uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newUuid — 비보안 컨텍스트(사내망 http)에서도 동작", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("randomUUID가 있으면 그대로", () => {
    expect(newUuid()).toMatch(V4);
  });
  it("randomUUID가 없으면 getRandomValues로 v4 형식", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    const ids = new Set(Array.from({ length: 50 }, () => newUuid()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(V4);
  });
});
