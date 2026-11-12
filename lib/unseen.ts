/**
 * 새 소식 표시 (PRD §9, 2026-11-09 사이트 수정 7·8) — 순수 함수.
 * 읽지 않은 알림의 link_path와 목록 행의 href가 같은 화면을 가리키면 그 행에 "새 소식" 칩을 단다.
 * 그 화면을 열면(lib/actions/notifications.markPathRead) 같은 경로의 알림이 읽음이 되어 칩이 사라진다.
 */

/**
 * 경로 비교용: 쿼리·해시·끝 슬래시를 뗀다 ("/b/x/samples/1#return" → "/b/x/samples/1").
 * 옛 제안 목록 주소 "/b/x/offers"는 진행 화면으로 리다이렉트되므로 "/b/x/progress"와 같은 화면으로 본다(예전 알림도 읽음 처리되게).
 */
export function normPath(p: string | null | undefined): string | null {
  if (!p || !p.startsWith("/")) return null;
  const cut = p.split(/[?#]/)[0];
  const clean = cut.length > 1 ? cut.replace(/\/+$/, "") : cut;
  return clean.replace(/^(\/b\/[^/]+)\/offers$/, "$1/progress");
}

/** 읽지 않은 알림들 → 경로 집합 */
export function unseenPaths(rows: { link_path: string | null; read_at?: string | null }[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.read_at) continue;
    const p = normPath(r.link_path);
    if (p) out.add(p);
  }
  return out;
}

export const isUnseen = (paths: Set<string>, href: string | null | undefined) => {
  const p = normPath(href);
  return !!p && paths.has(p);
};

/** 이 화면을 열었을 때 읽음으로 바꿀 알림 id (같은 경로만) */
export const idsForPath = (rows: { id: string; link_path: string | null }[], path: string) => {
  const p = normPath(path);
  return p ? rows.filter((r) => normPath(r.link_path) === p).map((r) => r.id) : [];
};
