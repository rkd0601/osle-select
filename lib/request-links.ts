/**
 * 요청 작성 화면(클라이언트)용 순수 함수 — zod 없이 (번들 예산 규칙: 클라이언트는 lib/requests를 import하지 않는다).
 * 서버는 lib/requests.ts의 RequestInput(HttpUrl)으로 다시 검증한다.
 */

/** http(s) 링크 모양(서버 HttpUrl과 같은 범위: http/https + 호스트) */
export const looksLikeHttpUrl = (u: string) => {
  if (!/^https?:\/\//i.test(u) || /\s/.test(u)) return false;
  try {
    return !!new URL(u).hostname;
  } catch {
    return false;
  }
};

/**
 * 링크 → 사람이 읽는 도메인("https://www.instagram.com/p/x" → "instagram.com", "item.taobao.com" 그대로). 링크 모양이 아니면 null.
 * 요청 작성 레일의 임시 이름(D7)과 요청 상세의 도메인 칩(D9)이 같이 쓴다.
 */
export function linkDomain(u: string | null | undefined): string | null {
  const s = (u ?? "").trim();
  if (!looksLikeHttpUrl(s)) return null;
  return new URL(s).hostname.replace(/^(www|m)\./i, "").toLowerCase();
}

/** 붙여넣은 글에서 http(s) 링크만 순서대로 (공백·줄바꿈 구분, 중복 제거). 2개 이상이면 요청 작성 화면이 스타일을 나눈다 */
export function splitPastedUrls(text: string): string[] {
  const out: string[] = [];
  for (const tok of text.split(/\s+/)) {
    const u = tok.trim().replace(/[,;]+$/, "");
    if (/^https?:\/\/\S+$/i.test(u) && !out.includes(u)) out.push(u);
  }
  return out;
}

/** 레일 아래 한 줄 검증: 처음 걸리는 스타일 번호와 이유 */
export type StyleIssue = { n: number; kind: "source" | "desc" | "link" };
export function styleIssue(styles: { description: string; imageCount: number; links: string[] }[]): StyleIssue | null {
  for (let i = 0; i < styles.length; i++) {
    const s = styles[i];
    const links = s.links.map((l) => l.trim()).filter(Boolean);
    if (!s.imageCount && !links.length) return { n: i + 1, kind: "source" };
    if (links.some((l) => !looksLikeHttpUrl(l))) return { n: i + 1, kind: "link" };
    if (!s.description.trim()) return { n: i + 1, kind: "desc" };
  }
  return null;
}
