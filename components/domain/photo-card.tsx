import Link from "next/link";

/**
 * 사진 카드 `.pcard` (디자인 v2.2 §4, DECISIONS d-7·d-11) — 진행 중인 모든 것(요청 항목·제안·샘플·발주)의 한 장.
 * 사진(3:4, 라벨은 '할 일'(금색 점)·'새 제안' 둘만) → 이름 14/500 + em(수량·가격, muted) → 상태 한 문장 13 → 있으면 버튼.
 * 트랙·상태 점·코드·체크박스 없음. 사진·이름·문장은 상세로 가는 링크, 버튼(children)은 링크 밖(중첩 인터랙션 금지).
 * 문구는 호출부가 i18n으로 넘긴다(규칙 10). className으로 12칸 그리드 폭(c3) 지정.
 */
export function PhotoCard(props: {
  href: string;
  photo: string | null;
  name: string;
  em?: string | null;          // "35장" · "₩16,300"
  state: string;               // "샘플을 돌려보내 주세요 · 11월 18일까지"
  pill?: string | null;        // "할 일" | "새 제안"
  emptyLabel?: string;         // 사진 없을 때 빗금 면 글자
  className?: string;
  children?: React.ReactNode;  // 버튼 1~2개
}) {
  return (
    <div className={`pcard ${props.className ?? ""}`}>
      <Link href={props.href} className="group block">
        <span className={`photo ${props.photo ? "block" : "empty-photo"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL */}
          {props.photo ? <img src={props.photo} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span>{props.emptyLabel}</span>}
          {props.pill && <span className="pill">{props.pill}</span>}
        </span>
        <span className="name block group-hover:text-signature">{props.name}{props.em && <em>{props.em}</em>}</span>
        <span className="state">{props.state}</span>
      </Link>
      {props.children && <div className="acts">{props.children}</div>}
    </div>
  );
}
