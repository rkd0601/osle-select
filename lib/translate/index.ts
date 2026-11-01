import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 자유 텍스트 번역 (PRD D12). 구조화 필드(혼용률·사이즈·세탁·컬러)는 번역하지 않는다.
 * 입력 타입에는 자유 텍스트 필드만 있다 — 원가·환율·원청 코드 등은 타입 레벨에서 넣을 수 없다 (CLAUDE.md 절대 규칙 11).
 * 3단계: 승인된 용어 사전 주입 + 단방향 번역. 역번역 비교·불확실 하이라이트는 5단계에서 이 모듈에 추가한다.
 */
export type TranslatableField = "request_title" | "request_memo" | "item_description" | "comment" | "cn_question" | "cn_answer";
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

const MODEL = "claude-opus-5-5";
const LANG = { ko: "Korean", "zh-CN": "Simplified Chinese" } as const;

async function glossary(): Promise<{ term_zh: string; term_ko: string }[]> {
  const { data } = await createAdminClient().from("glossary").select("term_zh, term_ko").eq("approved", true).limit(500);
  return data ?? [];
}

export async function translate(input: TranslateInput): Promise<TranslateResult> {
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
    return { ok: true, data: parsed.translations.map((t, i) => (texts[i] ? t : "")) };
  } catch (e) {
    if (e instanceof Anthropic.APIError || e instanceof SyntaxError) return { ok: false, error: "translate.failed" };
    throw e;
  }
}
