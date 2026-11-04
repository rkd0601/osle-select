import Link from "next/link";
import { fmtDate, isOverdue } from "@/lib/format";
import { tk } from "@/lib/i18n";

/**
 * 브랜드 영역 목록 행 (요청·샘플·발주 공통 골격). 에디토리얼 리스트 — 상품 그리드가 아니다(CLAUDE.md).
 * 데스크톱: 날짜 | 제목·보조 | 수량 | 금액 | 기한 | 상태. 모바일: 제목·보조 + 상태, 그 아래 한 줄 메타.
 * "내 차례" 행은 시그니처 왼쪽 띠 + 배지. 문구는 전부 i18n(규칙 10).
 */
const GRID = "md:grid-cols-[76px_minmax(0,1fr)_84px_120px_132px_128px]";

export function ListTable({ head, children }: { head: { date: string; title: string; qty: string; amount: string; due: string; status: string }; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className={`hidden gap-x-4 border-b border-ink bg-paper px-4 py-2 text-caption font-semibold tracking-wide text-muted md:grid ${GRID}`}>
        <span>{head.date}</span>
        <span>{head.title}</span>
        <span className="text-right">{head.qty}</span>
        <span className="text-right">{head.amount}</span>
        <span className="text-right">{head.due}</span>
        <span className="text-right">{head.status}</span>
      </div>
      <ul className="divide-y divide-line">{children}</ul>
    </div>
  );
}

export function ListRow(props: {
  href: string;
  mine?: boolean;
  date: string;
  title: string;
  sub?: React.ReactNode;
  qty?: string | null;
  amount?: string | null;
  due?: string | null;
  status: React.ReactNode;
}) {
  const due = props.due ? <Due at={props.due} mine={props.mine} /> : null;
  return (
    <li>
      <Link href={props.href} className={`group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-paper ${GRID}`}>
        {props.mine && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-signature" />}
        <span className="num hidden text-meta text-ink-2 md:block">{props.date}</span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            {props.mine && <span className="shrink-0 rounded-full bg-signature-soft px-2 py-0.5 text-micro font-semibold text-signature">{tk("list.mine")}</span>}
            <span className="truncate text-strong font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{props.title}</span>
          </span>
          {props.sub && <span className="mt-0.5 block truncate text-meta text-ink-2">{props.sub}</span>}
          <span className="num mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-ink-2 md:hidden">
            <span>{props.date}</span>
            {props.qty && <span>{props.qty}</span>}
            {props.amount && <span className="font-semibold text-ink">{props.amount}</span>}
            {due}
          </span>
        </span>
        <span className="num hidden text-right text-body text-ink-2 md:block">{props.qty ?? "—"}</span>
        <span className="num hidden text-right text-body font-semibold md:block">{props.amount ?? "—"}</span>
        <span className="hidden text-right md:block">{due ?? <span className="text-meta text-muted">—</span>}</span>
        <span className="flex justify-end">{props.status}</span>
      </Link>
    </li>
  );
}

/** 기한 표시: 지남 = 위험색, 내 차례 = 시그니처, 그 외 = 보조색 */
export function Due({ at, mine, withTime = false }: { at: string; mine?: boolean; withTime?: boolean }) {
  const late = isOverdue(at);
  const cls = late ? "font-semibold text-crit" : mine ? "font-medium text-signature" : "text-ink-2";
  return <span className={`num text-meta ${cls}`}>{tk(late ? "common.overdue" : "common.dueIn", { date: fmtDate(at, "ko", withTime) })}</span>;
}

/** 검색어 정규화 (공백·대소문자 무시) */
export const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, "");
export const matches = (q: string | undefined, ...fields: (string | null | undefined)[]) => !q || fields.some((f) => norm(f).includes(norm(q)));

/** 브랜드 목록의 탭·검색 쿼리 */
export type ListQuery = { tab?: string; q?: string };
