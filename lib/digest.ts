/**
 * 다이제스트 묶음 (PRD 12장 "알림이 항목 단위 다이제스트로 묶인다 — 제안 7개 발행 → 브랜드 1통").
 * 수신자별로, 같은 대상(entity·entity_id, 없으면 type·link)은 한 줄로 합치고 건수를 센다. 최신 제목·링크를 쓴다.
 */
export type DigestRow = { id: string; recipient_id: string; type: string; title: string; link_path: string | null; entity: string | null; entity_id: string | null; created_at: string };
export type DigestLine = { key: string; title: string; link_path: string | null; count: number; ids: string[] };

export function groupDigest(rows: DigestRow[]): Map<string, DigestLine[]> {
  const out = new Map<string, Map<string, DigestLine>>();
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const r of sorted) {
    const key = r.entity && r.entity_id ? `${r.entity}:${r.entity_id}` : `${r.type}:${r.link_path ?? ""}`;
    const m = out.get(r.recipient_id) ?? new Map<string, DigestLine>();
    const cur = m.get(key);
    if (cur) {
      cur.count += 1;
      cur.ids.push(r.id);
      cur.title = r.title;
      cur.link_path = r.link_path ?? cur.link_path;
    } else m.set(key, { key, title: r.title, link_path: r.link_path, count: 1, ids: [r.id] });
    out.set(r.recipient_id, m);
  }
  return new Map([...out].map(([k, m]) => [k, [...m.values()]]));
}

/** 채널: CN 역할은 WeCom, 나머지(브랜드·ADMIN)는 이메일. 인앱은 공통(행 자체) */
export const channelFor = (role: string | null | undefined): "email" | "wecom" | null =>
  role === "CN_SOURCER" || role === "CN_VENDOR" ? "wecom" : role ? "email" : null;
