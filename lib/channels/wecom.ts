import "server-only";

/**
 * WeCom 그룹 봇 webhook (CN 채널, PRD D17: 담당자명 + 딥링크). 서버에서만 호출 — /cn 화면은 외부 의존 금지(규칙 9).
 * 원가·금액은 넣지 않는다(제목 템플릿 + 링크). URL이 없으면 건너뛴다.
 */
export async function postWecom(markdown: string): Promise<{ ok: true } | { ok: false; error: string; skipped?: boolean }> {
  const url = process.env.WECOM_WEBHOOK_URL;
  if (!url) return { ok: false, error: "no_webhook", skipped: true };
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ msgtype: "markdown", markdown: { content: markdown.slice(0, 4000) } }) });
    const body = (await res.json().catch(() => null)) as { errcode?: number; errmsg?: string } | null;
    return res.ok && (body?.errcode ?? 0) === 0 ? { ok: true } : { ok: false, error: `${res.status} ${body?.errmsg ?? ""}`.slice(0, 300) };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300) };
  }
}

/** 마크다운 특수문자 최소 이스케이프 (제목은 i18n 템플릿이라 사용자 입력이 거의 없지만 담당자명 등) */
export const wecomEscape = (s: string) => s.replace(/[\[\]()<>*_`]/g, "");
