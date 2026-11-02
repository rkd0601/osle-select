import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkField, type FieldCheck } from "./check";
import { termCandidates } from "./terms";

/**
 * 자유 텍스트 번역 (PRD D12). 구조화 필드(혼용률·사이즈·세탁·컬러)는 번역하지 않는다.
 * 입력 타입에는 자유 텍스트 필드만 있다 — 원가·환율·원청 코드 등은 타입 레벨에서 넣을 수 없다 (CLAUDE.md 절대 규칙 11).
 * 3단계: 승인된 용어 사전 주입 + 단방향 번역. 역번역 비교·불확실 하이라이트는 5단계에서 이 모듈에 추가한다.
 */
export type TranslatableField =
  | "request_title" | "request_memo" | "item_description" | "comment" | "cn_question" | "cn_answer"
  | "product_name" | "product_desc" | "quality_note" | "color_name" | "decline_note";
export type TranslateInput = {
  from: "ko" | "zh-CN";
  to: "ko" | "zh-CN";
  segments: { field: TranslatableField; text: string }[];
};
// 원가 계열 키가 TranslateInput에 끼어들면 컴파일 오류가 나도록 고정한다
type ForbiddenKeys = "cost_cny" | "tiers" | "fx_rate" | "hidden_margin_rate" | "vendor_code" | "weight_g";
type AssertNoForbidden<T> = Extract<keyof T, ForbiddenKeys> extends never ? true : never;
const _noCostFields: AssertNoForbidden<TranslateInput> & AssertNoForbidden<TranslateInput["segments"][number]> = true;
void _noCostFields;

export type TranslateResult = { ok: true; data: string[] } | { ok: false; error: "translate.unavailable" | "translate.failed" };

/** 기본 모델. 환경변수 TRANSLATE_MODEL로 바꿀 수 있다(.env.example 참고). */
const MODEL = process.env.TRANSLATE_MODEL || "claude-opus-5-5";
const LANG = { ko: "Korean", "zh-CN": "Simplified Chinese" } as const;

/** 번역에서 나온 새 용어 짝을 승인 대기(approved=false)로 쌓는다 (r8-3). 실패해도 번역 결과에는 영향 없음 */
async function queueTerms(input: TranslateInput, outputs: string[], known: { term_zh: string; term_ko: string }[]) {
  const rows = termCandidates(input.from, input.segments, outputs, known);
  if (!rows.length) return;
  await createAdminClient().from("glossary").upsert(rows.map((r) => ({ ...r, category: "auto", approved: false })), { onConflict: "term_zh,term_ko", ignoreDuplicates: true });
}

export async function glossary(): Promise<{ term_zh: string; term_ko: string }[]> {
  const { data } = await createAdminClient().from("glossary").select("term_zh, term_ko").eq("approved", true).limit(500);
  return data ?? [];
}

export async function translate(input: TranslateInput, opts: { queueTerms?: boolean } = {}): Promise<TranslateResult> {
  const texts = input.segments.map((s) => s.text.trim());
  if (!texts.some(Boolean)) return { ok: true, data: texts };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "translate.unavailable" };

  const terms = await glossary();
  const system = [
    `You translate short B2B fashion-sourcing texts between Korean brands and Chinese wholesale sourcers (Guangzhou/Hangzhou markets).`,
    `Translate from ${LANG[input.from]} to ${LANG[input.to]}. Keep numbers, sizes, units, URLs and product codes unchanged.`,
    `Use natural trade wording a market sourcer would use. Do not add explanations.`,
    terms.length ? `Always use this approved glossary (zh = ko):\n${terms.map((g) => `${g.term_zh} = ${g.term_ko}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { translations: { type: "array", items: { type: "string" } } },
            required: ["translations"],
            additionalProperties: false,
          },
        },
      },
      system,
      messages: [
        {
          role: "user",
          content: `Translate each segment. Return translations in the same order (${texts.length} items).\n\n${JSON.stringify(
            input.segments.map((s, i) => ({ i, field: s.field, text: texts[i] })),
          )}`,
        },
      ],
    });
    if (res.stop_reason !== "end_turn") return { ok: false, error: "translate.failed" };
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return { ok: false, error: "translate.failed" };
    const parsed = JSON.parse(block.text) as { translations: string[] };
    if (parsed.translations.length !== texts.length) return { ok: false, error: "translate.failed" };
    const data = parsed.translations.map((t, i) => (texts[i] ? t : ""));
    if (opts.queueTerms !== false) await queueTerms(input, data, terms).catch(() => null); // 역번역(검증용)은 쌓지 않는다
    return { ok: true, data };
  } catch (e) {
    if (e instanceof Anthropic.APIError || e instanceof SyntaxError) return { ok: false, error: "translate.failed" };
    throw e;
  }
}

/**
 * 번역 + 역번역 검증 (A-03). 각 세그먼트에 유사도·불확실·사전 위반을 붙인다. 원가 필드는 TranslateInput 타입에 들어갈 수 없다.
 * 호출 2회(번역, 역번역). 실패하면 번역 결과만이라도 돌려주지 않고 실패로 처리한다(관리자가 직접 입력).
 */
export async function translateWithCheck(input: TranslateInput): Promise<
  { ok: true; data: { text: string; check: FieldCheck }[] } | { ok: false; error: "translate.unavailable" | "translate.failed" }
> {
  const fwd = await translate(input);
  if (!fwd.ok) return fwd;
  const back = await translate({ from: input.to, to: input.from, segments: input.segments.map((s, i) => ({ field: s.field, text: fwd.data[i] })) }, { queueTerms: false });
  if (!back.ok) return back;
  const terms = await glossary();
  const dir = input.from === "zh-CN" ? "zh>ko" : "ko>zh";
  return {
    ok: true,
    data: input.segments.map((s, i) => ({ text: fwd.data[i], check: checkField(s.text, fwd.data[i], back.data[i], terms, dir) })),
  };
}
