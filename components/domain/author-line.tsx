import { tk } from "@/lib/i18n";
import type { AuthorLabel } from "@/lib/authors";

/** 요청·샘플 상세의 작성자 한 줄 (r8-4). 전 멤버는 이름 뒤 라벨, 위아더 대행은 "위아더" */
export function AuthorLine({ a }: { a: AuthorLabel }) {
  if (a.kind === "unknown") return null;
  const who = a.kind === "staff" ? tk("author.staff") : a.name;
  return (
    <span className="text-[12px] text-muted">
      {tk("author.by", { name: who })}
      {a.kind === "former" && <span className="ml-1 text-ink-2">{tk("author.former")}</span>}
    </span>
  );
}
