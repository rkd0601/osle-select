/**
 * 브라우저에서 쓰는 UUID v4. `crypto.randomUUID`는 보안 컨텍스트(https·localhost)에서만 있다 —
 * 사내망 주소(http://10.x.x.x:3000)로 휴대폰에서 열면 undefined라 C-02 빠른 등록이 열리자마자 멈췄다.
 * `crypto.getRandomValues`는 비보안 컨텍스트에서도 있으므로 그걸로 같은 형식을 만든다.
 */
export function newUuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
