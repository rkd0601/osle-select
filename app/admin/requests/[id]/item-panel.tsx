"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n/admin";
import type { NeedsInfoReason } from "@/lib/requests";
import { QTY_RANGES } from "@/lib/codes";
import {
  assignRequestItem, mergeRequestItems, requestMoreInfo, suggestTranslation, transitionRequestItem, updateRequestItem,
} from "../actions";

type Item = {
  id: string; seq: number; status: string; category: string | null; description: string; description_zh: string | null;
  target_price_krw: number | null; expected_qty_range: string | null; assigned_to: string | null; sla_date: string | null;
};
type Result = { ok: true } | { ok: false; error: string };

const input = "field";
const btn = "btn sec sm";
const btnPrimary = "btn sm";

/**
 * A-02 항목 패널: 항목 정리(내용·중국어) · 보완 요청 · 배정/재배정 · 보류 · 배정 취소 · 병합.
 * 버튼은 서버가 넘긴 allowed(전이 테이블)로만 노출하고, 서버 액션이 다시 검증한다.
 */
export function ItemPanel({
  item, allowed, editable, staff, siblings, defaultSla, reasons,
}: {
  item: Item;
  allowed: string[];
  editable: boolean;
  staff: { id: string; name: string; role: string }[];
  siblings: { id: string; seq: number }[];
  defaultSla: string;
  /** 보완 요청 사유 코드 (서버에서 넘김 — zod를 클라이언트 번들에 싣지 않으려고) */
  reasons: readonly NeedsInfoReason[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({
    category: item.category ?? "", description: item.description, descriptionZh: item.description_zh ?? "",
    targetPrice: item.target_price_krw?.toString() ?? "", qty: item.expected_qty_range ?? "",
  });
  const [reason, setReason] = useState<NeedsInfoReason>(reasons[0]);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(item.assigned_to ?? staff[0]?.id ?? "");
  const [sla, setSla] = useState(item.sla_date ?? defaultSla);
  const [mergeTo, setMergeTo] = useState(siblings[0]?.id ?? "");

  const run = (fn: () => Promise<Result>, ok = "common.saved") =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      setMsg(tk(res.ok ? ok : res.error));
      if (res.ok) router.refresh();
    });

  const save = () =>
    run(() =>
      updateRequestItem(item.id, {
        ...(editable && {
          category: f.category || null, description: f.description, expectedQtyRange: f.qty || null,
          targetPriceKrw: f.targetPrice ? Number(f.targetPrice) : null,
        }),
        descriptionZh: f.descriptionZh || null,
      }),
    );

  const draftZh = () =>
    start(async () => {
      setMsg(null);
      const res = await suggestTranslation(f.description, "item_description");
      if (res.ok) setF((x) => ({ ...x, descriptionZh: res.data }));
      else setMsg(tk(res.error));
    });

  const canAssign = allowed.includes("assigned") || item.status === "assigned" || item.status === "sourcing";

  return (
    <div className="space-y-6">
      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
        <label className="field"><span className="lbl">{tk("admin.request.ko")}</span>
          <input disabled={!editable} value={f.description} maxLength={200} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        <label className="field" lang="zh-CN">
          <span className="lbl flex justify-between">{tk("admin.request.descZh")}
            <button type="button" className="text-ink-2 underline underline-offset-4 hover:text-ink" disabled={pending} onClick={draftZh}>{tk("admin.request.translate")}</button>
          </span>
          <input className={f.descriptionZh ? "" : "border-b-warn"} value={f.descriptionZh} maxLength={400} onChange={(e) => setF({ ...f, descriptionZh: e.target.value })} />
        </label>
        <div className="grid grid-cols-3 gap-x-6 lg:col-span-2">
          <input aria-label={tk("request.field.category")} className={input} disabled={!editable} placeholder={tk("request.field.category")} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <select className={input} disabled={!editable} aria-label={tk("request.field.qty")} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })}>
            <option value="">{tk("request.field.qty")} -</option>
            {QTY_RANGES.map((q) => <option key={q} value={q}>{tk(`qtyRange.${q}`)}</option>)}
          </select>
          <input aria-label={tk("request.field.targetPrice")} className={`${input} num`} disabled={!editable} inputMode="numeric" placeholder={tk("request.field.targetPrice")} value={f.targetPrice} onChange={(e) => setF({ ...f, targetPrice: e.target.value.replace(/[^\d]/g, "") })} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnPrimary} disabled={pending} onClick={save}>{tk("common.save")}</button>
        {msg && <span className="text-meta text-ink-2">{msg}</span>}
      </div>

      {canAssign && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-line pt-5">
          <label className="field min-w-48"><span className="lbl">{tk("admin.request.assignee")}</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
            </select>
          </label>
          <label className="field"><span className="lbl">{tk("admin.request.slaDate")}</span>
            <input type="date" className="num" value={sla} onChange={(e) => setSla(e.target.value)} />
          </label>
          {/* 서버도 description_zh 없으면 거부한다(request.error.needZh). 저장된 값 기준 — 번역 초안 → 확인 → 저장 후 배정 */}
          {!item.description_zh && <span className="pb-3 text-meta text-warn">{tk("request.error.needZh")}</span>}
          <button className={btnPrimary} disabled={pending || !assignee || !item.description_zh} onClick={() => run(() => assignRequestItem(item.id, { assigneeId: assignee, slaDate: sla }))}>
            {item.status === "assigned" || item.status === "sourcing" ? tk("admin.request.reassign") : tk("admin.request.assign")}
          </button>
        </div>
      )}

      {allowed.includes("needs_info") && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-line pt-5">
          <select className={`${input} w-auto`} aria-label={tk("a11y.needsInfoReason")} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {reasons.map((r) => <option key={r} value={r}>{tk(`needsInfo.reason.${r}`)}</option>)}
          </select>
          <input aria-label={tk("admin.request.needsInfo.note")} className={`${input} w-64`} placeholder={tk("admin.request.needsInfo.note")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          <button className={btn} disabled={pending} onClick={() => run(() => requestMoreInfo(item.id, { reason, note }))}>{tk("admin.request.needsInfo")}</button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-5">
        {allowed.includes("on_hold") && <button className={btn} disabled={pending} onClick={() => run(() => transitionRequestItem(item.id, "on_hold"))}>{tk("admin.request.hold")}</button>}
        {item.status === "assigned" && allowed.includes("received") && (
          <button className={btn} disabled={pending} onClick={() => run(() => transitionRequestItem(item.id, "received"))}>{tk("admin.request.unassign")}</button>
        )}
        {editable && siblings.length > 0 && (
          <span className="flex items-end gap-2">
            <select className={`${input} w-20`} aria-label={tk("a11y.mergeTo")} value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}>
              {siblings.map((s) => <option key={s.id} value={s.id}>#{s.seq}</option>)}
            </select>
            <button className={btn} disabled={pending || !mergeTo} onClick={() => run(() => mergeRequestItems(item.id, mergeTo))}>{tk("admin.request.mergeInto")}</button>
          </span>
        )}
      </div>
    </div>
  );
}
