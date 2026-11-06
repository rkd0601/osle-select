"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import { ImagePicker, type PickedImage } from "./image-picker";
import { QTY_RANGES } from "@/lib/codes";
import { linkDomain, parsePasteBox } from "@/lib/request-links";

/** 스타일 하나 = 링크 한 줄 또는 사진 한 장 (d-28). 메모(= 한 줄 설명)·카테고리·수량·가격은 선택 */
type Draft = { key: number; link: string | null; image: PickedImage | null; description: string; category: string; targetPrice: string; qty: string; open: boolean };
const MAX_STYLES = 20;
/** "아직 몰라요"는 빈 값(=미정)으로 보낸다 — tbd는 같은 뜻이라 목록에서 뺀다 */
const QTY_OPTIONS = QTY_RANGES.filter((q) => q !== "tbd");
/** 희망 제안일 기본 = 오늘 + 7일 (로컬 날짜) */
const plusDays = (n: number) => {
  const d = new Date(Date.now() + n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * B-02 요청 작성 v3 (프로토타입 v2.7 "요청 작성", DESIGN_SPEC v2.7, NEXT §0-l A1~A4).
 * 12칸 그리드의 자식 두 개를 낸다(`<form class="contents">`):
 *  왼쪽 c8 = 링크 붙여넣기 상자 4칸 | 사진 올리기 4칸 → "담긴 스타일 n"(.style-row: 썸네일 1칸 · 도메인 칩/"사진 1장" · 자세히·삭제 · 한 줄 메모,
 *   "자세히"를 펴면 7칸 소그리드 3·2·2) → "언제까지 제안받을까요"(희망 제안일 3 · 요청 이름 2 · 메모 3).
 *  오른쪽 c4 = sticky 레일(번호 · 도메인/사진 · "메모 있음|링크|사진", "스타일 n개 요청하기" — 1개부터, 한 문장).
 * 붙여넣으면 바로(또는 Enter·상자 밖으로 나갈 때) 링크마다 스타일 하나로 나뉜다. 링크가 아닌 낱말은 상자에 남기고 한 줄로 알린다.
 * 필수 = 링크나 사진 하나 + 희망 제안일. 링크 썸네일·이름은 접수 뒤 서버가 og 메타로 채운다(A3).
 * submit 으로 서버 액션(브랜드 createRequest / 관리자 createRequestOnBehalf)을 고른다. 부모는 `.g12` 안에 둔다.
 */
export function RequestForm({
  brandId,
  categories,
  doneHrefPrefix,
  doneHrefSuffix = "",
  submit,
}: {
  brandId: string;
  categories: string[];
  /** 생성 후 이동: `${doneHrefPrefix}${requestId}${doneHrefSuffix}` */
  doneHrefPrefix: string;
  doneHrefSuffix?: string;
  /** 예전 호출부 호환(희망일 경고는 v3에서 뺐다 — 기본이 오늘 + 7일) */
  minLeadDays?: number;
  submit: (brandId: string, input: unknown) => Promise<{ ok: true; data: { requestId: string } } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const uid = useId();
  const keyRef = useRef(0);
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [targetDate, setTargetDate] = useState(() => plusDays(7));
  const [paste, setPaste] = useState("");
  const [bad, setBad] = useState<string[]>([]);
  const [items, setItems] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const make = (p: Partial<Draft>): Draft => ({ key: ++keyRef.current, link: null, image: null, description: "", category: "", targetPrice: "", qty: "", open: false, ...p });
  const set = (key: number, patch: Partial<Draft>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const remove = (key: number) => setItems((xs) => xs.filter((x) => x.key !== key));

  /** 상자 글 → 링크 스타일 추가. 남은(링크 아닌) 낱말은 상자에 그대로 */
  const takeLinks = (text: string) => {
    const { urls, bad: rest } = parsePasteBox(text, items.flatMap((x) => (x.link ? [x.link] : [])));
    const room = MAX_STYLES - items.length;
    if (urls.length) setItems((xs) => [...xs, ...urls.slice(0, room).map((link) => make({ link }))]);
    setBad(rest);
    setPaste(rest.join("\n"));
    return urls.length > 0;
  };
  const addPhotos = (imgs: PickedImage[]) =>
    setItems((xs) => [...xs, ...imgs.slice(0, MAX_STYLES - xs.length).map((image) => make({ image }))]);

  const label = (it: Draft) => (it.link ? linkDomain(it.link) ?? it.link : tk("request.style.photoCount", { n: 1 }));
  const meta = (it: Draft) => (it.description.trim() ? tk("request.v3.meta.memo") : it.link ? tk("request.v3.meta.link") : tk("request.v3.meta.photo"));
  const canSubmit = items.length > 0 && !!targetDate && !pending;

  const onSubmit = () =>
    start(async () => {
      setError(null);
      if (!items.length) return setError(tk("request.v3.err.empty"));
      if (!targetDate) return setError(tk("request.v3.err.date"));
      const res = await submit(brandId, {
        title, memo, targetDate,
        items: items.map((it) => ({
          description: it.description, category: it.category, expectedQtyRange: it.qty,
          targetPriceKrw: it.targetPrice ? Number(it.targetPrice.replace(/[^\d]/g, "")) : null,
          imagePaths: it.image ? [it.image.path] : [], links: it.link ? [it.link] : [],
        })),
      });
      if (!res.ok) return setError(tk(res.error));
      router.push(`${doneHrefPrefix}${res.data.requestId}${doneHrefSuffix}`);
    });

  const fid = (k: number, f: string) => `${uid}-${k}-${f}`;

  return (
    <form className="contents" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="c8 min-w-0">
        <div className="src">
          <div className="src-col">
            <label className="src-label block" htmlFor={`${uid}-paste`}>{tk("request.style.link")}</label>
            <textarea id={`${uid}-paste`} className="paste" inputMode="url" placeholder={tk("request.v3.paste.ph")} value={paste}
              onChange={(e) => setPaste(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (parsePasteBox(text).urls.length) { e.preventDefault(); takeLinks(`${paste}\n${text}`); }
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && paste.trim()) { e.preventDefault(); takeLinks(paste); } }}
              onBlur={() => { if (paste.trim()) takeLinks(paste); }} />
            {bad.length > 0
              ? <span className="hint text-warn" role="status">{tk("request.v3.paste.bad", { n: bad.length })}</span>
              : <span className="hint">{tk("request.v3.paste.hint")}</span>}
          </div>
          <div className="src-col">
            <div className="src-label">{tk("request.style.photo")}</div>
            <ImagePicker brandId={brandId} value={[]} onChange={addPhotos} max={MAX_STYLES - items.length} layout="drop"
              addLabel={tk("request.v3.photo.drop")} addHint={tk("request.v3.photo.hint")} />
          </div>
        </div>

        <div className="section-h" style={{ marginTop: 40 }}>
          <h2>{tk("request.v3.list")}<span className="count num">{items.length}</span></h2>
          <span className="meta">{tk("request.v3.list.meta")}</span>
        </div>
        {items.length === 0 ? (
          <p className="styles-empty">{tk("request.v3.list.empty")}</p>
        ) : (
          <ul className="styles">
            {items.map((it) => (
              <li key={it.key} className="style-row">
                <span className="thumb" aria-hidden>
                  {it.image
                    // eslint-disable-next-line @next/next/no-img-element -- 업로드 직후 로컬 미리보기(blob URL)
                    ? <img src={it.image.preview} alt="" />
                    : <span>{tk("request.v3.meta.link")}</span>}
                </span>
                <div className="body">
                  <div className="t">
                    {it.link
                      ? <a className="chip" href={it.link} target="_blank" rel="noreferrer noopener">{label(it)} ↗</a>
                      : <span className="chip">{label(it)}</span>}
                    <span className="acts">
                      <button type="button" className="link" aria-expanded={it.open} aria-controls={fid(it.key, "more")} onClick={() => set(it.key, { open: !it.open })}>
                        {tk(it.open ? "request.v3.fold" : "request.v3.more")}
                      </button>
                      <button type="button" className="link" onClick={() => remove(it.key)}>{tk("request.style.remove")}</button>
                    </span>
                  </div>
                  <input className="memo" aria-label={tk("request.v3.memo")} maxLength={200} placeholder={tk("request.v3.memo.ph")}
                    value={it.description} onChange={(e) => set(it.key, { description: e.target.value })} />
                  {it.open && (
                    <div className="more" id={fid(it.key, "more")}>
                      <div className="field">
                        <label htmlFor={fid(it.key, "cat")}>{tk("request.field.category")}</label>
                        <select id={fid(it.key, "cat")} value={it.category} onChange={(e) => set(it.key, { category: e.target.value })}>
                          <option value="">{tk("request.style.pick")}</option>
                          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={fid(it.key, "qty")}>{tk("request.field.qty")}</label>
                        <select id={fid(it.key, "qty")} value={it.qty} onChange={(e) => set(it.key, { qty: e.target.value })}>
                          <option value="">{tk("request.style.qty.unknown")}</option>
                          {QTY_OPTIONS.map((q) => <option key={q} value={q}>{tk(`qtyRange.${q}`)}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={fid(it.key, "price")}>{tk("request.style.price")}</label>
                        <input id={fid(it.key, "price")} className="num" inputMode="numeric" placeholder={tk("request.style.price.ph")}
                          value={it.targetPrice ? Number(it.targetPrice).toLocaleString("ko-KR") : ""}
                          onChange={(e) => set(it.key, { targetPrice: e.target.value.replace(/[^\d]/g, "").slice(0, 8) })} />
                        <span className="hint">{tk("request.style.price.hint")}</span>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="section-h" style={{ marginTop: 40 }}><h2 id={`${uid}-when`}>{tk("request.v3.when")}</h2></div>
        <div className="req-when" role="group" aria-labelledby={`${uid}-when`}>
          <div className="field">
            <label htmlFor={`${uid}-date`}>{tk("request.v3.date")}</label>
            <input id={`${uid}-date`} className="num" type="date" required value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            <span className="hint">{tk("request.style.date.hint")}</span>
          </div>
          <div className="field">
            <label htmlFor={`${uid}-title`}>{tk("request.style.title")}</label>
            <input id={`${uid}-title`} maxLength={80} placeholder={tk("request.field.title.ph")} value={title} onChange={(e) => setTitle(e.target.value)} />
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
          {items.length > 0 && (
            <ol className="rail-list">
              {items.map((it, idx) => (
                <li key={it.key}>
                  <span className="num">{idx + 1}</span>
                  <span>{label(it)}</span>
                  <span className="meta">{meta(it)}</span>
                </li>
              ))}
            </ol>
          )}
          <button type="submit" className="btn lg" style={{ width: "100%", marginTop: 20 }} disabled={!canSubmit}>
            {pending ? tk("request.submitting") : items.length ? tk("request.style.submit", { n: items.length }) : tk("request.v3.submit.empty")}
          </button>
          <p className="label" style={{ marginTop: 12 }}>{tk("request.v3.railNote")}</p>
          {error && <p className="mt-2 text-meta text-crit" role="alert">{error}</p>}
        </div>
      </aside>
    </form>
  );
}
