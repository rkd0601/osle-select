/**
 * 작성자 표시 (DECISIONS r8-4): 내보낸 멤버가 남긴 기록은 브랜드에 남고 이름도 그대로, 지금 멤버 목록에 없으면 "(전 멤버)".
 * 위아더 직원(ADMIN·CN)이 대행으로 만든 기록은 사람 이름 대신 "위아더". 순수 함수 — 이름·역할은 호출부가 채운다.
 */
export type AuthorInfo = { name: string; email: string; role: string | null };
export type AuthorLabel = { kind: "member" | "former" | "staff" | "unknown"; name: string };

export function authorLabel(authorId: string | null | undefined, memberIds: ReadonlySet<string>, info: AuthorInfo | undefined): AuthorLabel {
  if (!authorId) return { kind: "unknown", name: "" };
  if (info?.role && !info.role.startsWith("BRAND_")) return { kind: "staff", name: "" };
  const name = info?.name || info?.email?.split("@")[0] || "";
  return { kind: memberIds.has(authorId) ? "member" : "former", name };
}
