/**
 * 요청 링크 메타(og:title · og:image) — 요청 작성 v3 A3 (NEXT §0-l, d-28).
 * 접수 뒤 서버가 `after()`로 가져와 썸네일·이름을 채운다. 실패하면 도메인만(호출부가 linkDomain).
 *
 * 안전: 사용자가 넣은 주소를 서버가 연다(SSRF) → http(s)만, 포트 80/443만, 이름을 풀어 사설·루프백·링크로컬 주소면 거부,
 * 리다이렉트는 손으로 최대 3번 따라가며 매번 다시 검사, 응답은 HTML 512KB · 이미지 5MB까지만 읽는다, 5초 시간 제한.
 * 남은 위험: 검사와 연결 사이 DNS가 바뀌는 경우(리바인딩) — 운영 전 egress 프록시로 막는다(STEP20 개발자 할 일).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type LinkMeta = { title: string | null; image: string | null };

const decodeEntities = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** <meta property|name="og:title" content="…"> 순서 무관. 첫 값 */
function metaContent(html: string, keys: string[]): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const key of keys) {
    for (const tag of tags) {
      const k = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (k !== key) continue;
      const v = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
      if (v?.trim()) return decodeEntities(v.trim());
    }
  }
  return null;
}

/** HTML → og:title(없으면 twitter:title → <title>) · og:image(상대 주소는 base 기준 절대로, http(s)만) */
export function parseLinkMeta(html: string, baseUrl: string): LinkMeta {
  const head = html.slice(0, 512 * 1024);
  const rawTitle = metaContent(head, ["og:title", "twitter:title"]) ?? (head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decodeEntities(head.match(/<title[^>]*>([^<]*)<\/title>/i)![1]) : null);
  const title = rawTitle ? rawTitle.replace(/\s+/g, " ").trim().slice(0, 200) || null : null;
  const rawImg = metaContent(head, ["og:image:secure_url", "og:image", "og:image:url", "twitter:image"]);
  let image: string | null = null;
  if (rawImg) {
    try {
      const u = new URL(rawImg, baseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") image = u.toString();
    } catch {
      image = null;
    }
  }
  return { title, image };
}

/** 사설·루프백·링크로컬·CGNAT·멀티캐스트·문서용 등 공인 아닌 주소 */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mapped) return isPrivateIp(mapped);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x) || x.startsWith("64:ff9b:") || x.startsWith("2001:db8");
  }
  return true; // 주소 모양이 아니면 막는다
}

/** 열어도 되는 주소인가: http(s) · 기본 포트 · 이름이 공인 주소로만 풀린다 */
export async function isFetchableUrl(raw: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  try {
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

const UA = "Mozilla/5.0 (compatible; OSLESelectLinkPreview/1.0)";

/** 검사 + 손 리다이렉트(최대 3) + 크기 제한 읽기. 실패는 null */
async function guardedGet(url: string, accept: string, maxBytes: number): Promise<{ body: Uint8Array; type: string; finalUrl: string } | null> {
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!(await isFetchableUrl(cur))) return null;
    let res: Response;
    try {
      res = await fetch(cur, { redirect: "manual", headers: { "user-agent": UA, accept, "accept-language": "ko,zh-CN;q=0.8,en;q=0.6" }, signal: AbortSignal.timeout(5000) });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!loc) return null;
      cur = new URL(loc, cur).toString();
      continue;
    }
    if (!res.ok || !res.body) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) {
      await res.body.cancel().catch(() => {});
      return null;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done || !value) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        break; // HTML은 앞부분만으로 충분하다. 이미지는 아래에서 크기로 거른다
      }
      chunks.push(value);
    }
    const body = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
    let off = 0;
    for (const c of chunks) { body.set(c, off); off += c.byteLength; }
    return { body, type: (res.headers.get("content-type") ?? "").toLowerCase(), finalUrl: cur };
  }
  return null;
}

/** 링크 → og 메타. HTML이 아니면 null */
export async function fetchLinkMeta(url: string): Promise<LinkMeta | null> {
  const r = await guardedGet(url, "text/html,application/xhtml+xml", 512 * 1024);
  if (!r || !/text\/html|application\/xhtml/.test(r.type)) return null;
  const charset = r.type.match(/charset=([\w-]+)/)?.[1]?.toLowerCase();
  let html: string;
  try {
    html = new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8", { fatal: false }).decode(r.body);
  } catch {
    html = new TextDecoder("utf-8").decode(r.body);
  }
  return parseLinkMeta(html, r.finalUrl);
}

export const LINK_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** og:image 내려받기 (jpeg·png·webp·gif, 5MB까지). 실패는 null */
export async function fetchLinkImage(url: string): Promise<{ body: Uint8Array; type: string; ext: string } | null> {
  const max = 5 * 1024 * 1024;
  const r = await guardedGet(url, "image/*", max + 1);
  if (!r || r.body.byteLength > max || r.body.byteLength < 200) return null;
  const type = r.type.split(";")[0].trim();
  const ext = LINK_IMAGE_TYPES[type];
  return ext ? { body: r.body, type, ext } : null;
}
