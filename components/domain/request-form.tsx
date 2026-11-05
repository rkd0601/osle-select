"use client";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { ImagePicker, type PickedImage } from "./image-picker";
import { QTY_RANGES } from "@/lib/codes";
import { linkDomain, splitPastedUrls, styleIssue } from "@/lib/request-links";

type Draft = { key: number; description: string; category: string; targetPrice: string; qty: string; images: PickedImage[]; links: string[]; note: string };
const empty = (key: number, links: string[] = [""]): Draft => ({ key, description: "", category: "", targetPrice: "", qty: "", images: [], links, note: "" });
const MAX_STYLES = 20;
const MAX_LINKS = 5;
const filled = (links: string[]) => links.map((l) => l.trim()).filter(Boolean);
/** "아직 몰라요"는 빈 값(=미정)으로 보낸다 — tbd는 같은 뜻이라 목록에서 뺀다 */
const QTY_OPTIONS = QTY_RANGES.filter((q) => q !== "tbd");

/**
 * B-02 요청 작성 v2.3 (프로토타입 v-request, DESIGN_SPEC_v2 "요청 작성 v2.3").
 * 12칸 그리드의 자식 두 개를 낸다(`<form class="contents">`): 왼쪽 c8 = 스타일 카드(펼친 것 하나 + 나머지 한 줄 요약) →
 * "+ 스타일 추가"(전폭 52) → "요청 전체" 3칸 / 오른쪽 c4 = sticky 레일(담긴 스타일 · "스타일 n개 요청하기" · 한 문장 · 검증 한 줄).
 * 스타일 카드: 머리(스타일 n · 제목 · 삭제) → 사진 올리기 | 또는 링크 붙여넣기(4·4, 링크 최대 5) → 한 줄 설명 → 카테고리·예상 수량·희망 공급가 → 메모.
 * 설명을 적기 전 이름은 첫 링크의 도메인("instagram.com") 또는 "사진 n장"(4차 검증 D7). 레일 목록 li = 번호 · 이름 · 메타 세 칸(L9).
 * 링크 여러 개를 한 번에 붙여넣으면 첫 링크는 그 자리에, 나머지는 스타일 하나씩 새로 만든다.
 * 스타일 메모는 서버 스키마(RequestInput)가 요청 메모에 "[스타일 n] …" 줄로 합친다(마이그레이션 없음).
 * submit 으로 서버 액션(브랜드 createRequest / 관리자 createRequestOnBehalf)을 고른다. 부모는 `.g12` 안에 둔다.
 */
export function RequestForm({
  brandId,
  categories,
  doneHrefPrefix,
  doneHrefSuffix = "",
  submit,
  minLeadDays = 14,
}: {
  brandId: string;
  categories: string[];
  /** 생성 후 이동: `${doneHrefPrefix}${requestId}${doneHrefSuffix}` */
  doneHrefPrefix: string;
  doneHrefSuffix?: string;
  /** 희망일이 오늘 + 이 값보다 빠르면 경고만 (settings.min_lead_days, COWORK_DECISIONS Q3) */
  minLeadDays?: number;
  submit: (brandId: string, input: unknown) => Promise<{ ok: true; data: { requestId: string } } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const uid = useId();
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [items, setItems] = useState<Draft[]>([empty(1)]);
  const [open, setOpen] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (key: number, patch: Partial<Draft>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const setLink = (key: number, li: number, v: string) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, links: x.links.map((l, i) => (i === li ? v : l)) } : x)));
  const nextKey = (xs: Draft[]) => Math.max(0, ...xs.map((x) => x.key)) + 1;
  const addStyle = () => {
    if (items.length >= MAX_STYLES) return;
    const k = nextKey(items);
    setItems([...items, empty(k)]);
    setOpen(k);
  };
  const removeStyle = (key: number) => {
    const rest = items.filter((x) => x.key !== key);
    if (!rest.length) return;
    setItems(rest);
    if (open === key) setOpen(rest[0].key);
  };
  /** 링크 여러 개 붙여넣기 → 첫 링크는 이 칸, 나머지는 새 스타일 하나씩 */
  const onPasteLinks = (key: number, li: number, text: string) => {
    const urls = splitPastedUrls(text);
    if (urls.length < 2) return false;
    setItems((xs) => {
      let k = nextKey(xs);
      const room = MAX_STYLES - xs.length;
      const extra = urls.slice(1, 1 + room).map((u) => empty(k++, [u]));
      return [...xs.map((x) => (x.key === key ? { ...x, links: x.links.map((l, i) => (i === li ? urls[0] : l)) } : x)), ...extra];
    });
    return true;
  };

  const issue = styleIssue(items.map((it) => ({ description: it.description, imageCount: it.images.length, links: it.links })));
  const id = (k: number, f: string) => `${uid}-${k}-${f}`;
  const counts = (it: Draft) => [
    it.images.length ? tk("request.style.count.photos", { n: it.images.length }) : null,
    filled(it.links).length ? tk("request.style.count.links", { n: filled(it.links).length }) : null,
  ].filter(Boolean) as string[];
  /** 이름: 설명 → 첫 링크 도메인 → 사진 n장 → "새 스타일" */
  const styleName = (it: Draft) => {
    const d = it.description.trim();
    if (d) return d;
    const host = filled(it.links).map(linkDomain).find(Boolean);
    if (host) return host;
    return it.images.length ? tk("request.style.photoCount", { n: it.images.length }) : tk("request.style.untitled");
  };
  const tooSoon = !!targetDate && new Date(`${targetDate}T23:59:59`) < new Date(Date.now() + minLeadDays * 86400000);

  const onSubmit = () =>
    start(async () => {
      setError(null);
      if (issue) { setOpen(items[issue.n - 1].key); return; }
      const res = await submit(brandId, {
        title, memo, targetDate,
        items: items.map((it) => ({
          description: it.description, category: it.category, expectedQtyRange: it.qty,
          targetPriceKrw: it.targetPrice ? Number(it.targetPrice.replace(/[^\d]/g, "")) : null,
          imagePaths: it.images.map((i) => i.path), links: filled(it.links), note: it.note,
        })),
      });
      if (!res.ok) return setError(tk(res.error));
      router.push(`${doneHrefPrefix}${res.data.requestId}${doneHrefSuffix}`);
    });

  return (
    <form className="contents" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="c8 min-w-0">
        {items.map((it, idx) => {
          const n = idx + 1;
          const name = styleName(it);
          if (it.key !== open) {
            const meta = [...counts(it), it.qty ? tk(`qtyRange.${it.qty}`) : null].filter(Boolean).join(" · ");
            return (
              <div key={it.key} className="style-card collapsed">
                <div className="sc-head">
                  <span className="sc-n num">{tk("request.style.n", { n })}</span>
                  <span className="sc-title">{name}{meta && <span className="meta"> · {meta}</span>}</span>
                  <button type="button" className="link" style={{ border: 0 }} onClick={() => setOpen(it.key)}>{tk("request.style.expand")}</button>
                </div>
              </div>
            );
          }
          return (
            <section key={it.key} className="style-card" aria-labelledby={id(it.key, "h")}>
              <div className="sc-head">
                <span className="sc-n num" id={id(it.key, "h")}>{tk("request.style.n", { n })}</span>
                <span className="sc-title">{name}</span>
                {items.length > 1 && (
                  <button type="button" className="link" style={{ border: 0, color: "var(--muted)" }} onClick={() => removeStyle(it.key)}>{tk("request.style.remove")}</button>
                )}
              </div>
              <div className="sc-body">
                <div className="src">
                  <div className="src-col src-photos">
                    <div className="src-label">{tk("request.style.photo")}</div>
                    <ImagePicker brandId={brandId} value={it.images} onChange={(images) => set(it.key, { images })} layout="stack"
                      addLabel={tk("request.style.photo.drop")} addHint={tk("request.style.photo.hint")} />
                  </div>
                  <div className="src-col">
                    <div className="src-label">{tk("request.style.linkOr")}</div>
                    {it.links.map((l, li) => (
                      <div key={li} className="field" style={li ? { marginTop: 12 } : undefined}>
                        <input id={id(it.key, `l${li}`)} aria-label={`${tk("request.style.link")} ${li + 1}`} inputMode="url" placeholder="https://" value={l}
                          onChange={(e) => setLink(it.key, li, e.target.value)}
                          onPaste={(e) => { if (onPasteLinks(it.key, li, e.clipboardData.getData("text"))) e.preventDefault(); }} />
                        {li === 0 && <span className="hint">{tk("request.style.link.hint")}</span>}
                      </div>
                    ))}
                    {it.links.length < MAX_LINKS && (
                      <button type="button" className="link" style={{ marginTop: 12, border: 0 }} onClick={() => set(it.key, { links: [...it.links, ""] })}>
                        {tk("request.style.link.add")}
                      </button>
                    )}
                  </div>
                </div>
                <div className="field" style={{ marginTop: 32 }}>
                  <label htmlFor={id(it.key, "desc")}>{tk("request.style.desc")} *</label>
                  <input id={id(it.key, "desc")} required maxLength={200} placeholder={tk("request.style.desc.ph")} value={it.description} onChange={(e) => set(it.key, { description: e.target.value })} />
                </div>
                <div className="grid3">
                  <div className="field">
                    <label htmlFor={id(it.key, "cat")}>{tk("request.field.category")}</label>
                    <select id={id(it.key, "cat")} value={it.category} onChange={(e) => set(it.key, { category: e.target.value })}>
                      <option value="">{tk("request.style.pick")}</option>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={id(it.key, "qty")}>{tk("request.field.qty")}</label>
                    <select id={id(it.key, "qty")} value={it.qty} onChange={(e) => set(it.key, { qty: e.target.value })}>
                      {QTY_OPTIONS.map((q) => <option key={q} value={q}>{tk(`qtyRange.${q}`)}</option>)}
                      <option value="">{tk("request.style.qty.unknown")}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={id(it.key, "price")}>{tk("request.style.price")}</label>
                    <input id={id(it.key, "price")} className="num" inputMode="numeric" placeholder={tk("request.style.price.ph")}
                      value={it.targetPrice ? Number(it.targetPrice).toLocaleString("ko-KR") : ""}
                      onChange={(e) => set(it.key, { targetPrice: e.target.value.replace(/[^\d]/g, "").slice(0, 8) })} />
                    <span className="hint">{tk("request.style.price.hint")}</span>
                  </div>
                </div>
                <div className="field" style={{ marginTop: 16 }}>
                  <label htmlFor={id(it.key, "note")}>{tk("request.style.note")}</label>
                  <input id={id(it.key, "note")} maxLength={300} placeholder={tk("request.style.note.ph")} value={it.note} onChange={(e) => set(it.key, { note: e.target.value })} />
                </div>
              </div>
            </section>
          );
        })}

        <button type="button" className="btn sec" style={{ marginTop: 16, width: "100%", height: 52 }} disabled={items.length >= MAX_STYLES} onClick={addStyle}>
          {tk("request.style.add")}
        </button>
        <p className="label" style={{ marginTop: 8 }}>{tk("request.style.pasteHint")}</p>

        <div className="section-h" style={{ marginTop: 56 }}><h2 id={`${uid}-info`}>{tk("request.style.section")}</h2></div>
        {/* 요청 전체: 8칸 소그리드 3 · 2 · 3 — 칸 모서리가 12칸 선에 온다(정렬 규칙 v2.3). 960 미만은 한 칸씩 */}
        <div className="req-all" role="group" aria-labelledby={`${uid}-info`}>
          <div className="field">
            <label htmlFor={`${uid}-title`}>{tk("request.style.title")}</label>
            <input id={`${uid}-title`} maxLength={80} placeholder={tk("request.field.title.ph")} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-date`}>{tk("request.style.date")}</label>
            <input id={`${uid}-date`} className="num" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            {tooSoon
              ? <span className="hint text-warn">{tk("request.warn.targetDateTooSoon", { n: minLeadDays })}</span>
              : <span className="hint">{tk("request.style.date.hint")}</span>}
          </div>
          <div className="field">
            <label htmlFor={`${uid}-memo`}>{tk("request.style.memo")}</label>
            <input id={`${uid}-memo`} maxLength={2000} placeholder={tk("request.style.memo.ph")} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* stretch: 레일(sticky)이 본문 높이만큼 따라 내려오게 */}
      <aside className="c4 min-w-0" style={{ alignSelf: "stretch" }}>
        <div className="rail">
          <div className="label">{tk("request.style.rail")}</div>
          <ol className="rail-list">
            {items.map((it, idx) => (
              <li key={it.key}>
                <span className="num">{idx + 1}</span>
                <span>
                  <button type="button" className="block w-full truncate text-left hover:text-signature" onClick={() => setOpen(it.key)}>
                    {styleName(it)}
                  </button>
                </span>
                <span className="meta num">{counts(it).join(" · ")}</span>
              </li>
            ))}
          </ol>
          <button type="submit" className="btn lg" style={{ width: "100%", marginTop: 16 }} disabled={!!issue || pending}>
            {pending ? tk("request.submitting") : tk("request.style.submit", { n: items.length })}
          </button>
          <p className="label" style={{ marginTop: 12 }}>{tk("request.style.railNote")}</p>
          {issue && <p className="err" role="status">{tk(`request.style.err.${issue.kind}`, { n: issue.n })}</p>}
          {error && <p className="mt-2 text-meta text-crit" role="alert">{error}</p>}
        </div>
      </aside>
    </form>
  );
}
