"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tk } from "@/lib/i18n";
import type { NeedsInfoReason } from "@/lib/requests";
import {
  assignRequestItem, mergeRequestItems, requestMoreInfo, suggestTranslation, transitionRequestItem, updateRequestItem,
} from "../actions";

type Item = {
  id: string; seq: number; status: string; category: string | null; description: string; description_zh: string | null;
  target_price_krw: number | null; expected_qty_range: string | null; assigned_to: string | null; sla_date: string | null;
};
type Result = { ok: true } | { ok: false; error: string };

const input = "w-full border border-line bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-ink";
const btn = "border border-ink px-3 py-1.5 text-[12px] disabled:opacity-40";
const btnPrimary = "bg-ink px-3 py-1.5 text-[12px] text-paper disabled:opacity-40";

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
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-[11px] text-ink-2">KO
          <input className={input} disabled={!editable} value={f.description} maxLength={200} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        <label className="text-[11px] text-ink-2" lang="zh-CN">
          <span className="flex justify-between">{tk("admin.request.descZh")}
            <button type="button" className="text-signature" disabled={pending} onClick={draftZh}>{tk("admin.request.translate")}</button>
          </span>
          <input className={`${input} ${f.descriptionZh ? "" : "border-warn"}`} value={f.descriptionZh} maxLength={400} onChange={(e) => setF({ ...f, descriptionZh: e.target.value })} />
        </label>
        <div className="grid grid-cols-3 gap-2 md:col-span-2">
          <input className={input} disabled={!editable} placeholder={tk("request.field.category")} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <input className={input} disabled={!editable} placeholder={tk("request.field.qty")} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
          <input className={`${input} num`} disabled={!editable} inputMode="numeric" placeholder={tk("request.field.targetPrice")} value={f.targetPrice} onChange={(e) => setF({ ...f, targetPrice: e.target.value.replace(/[^\d]/g, "") })} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnPrimary} disabled={pending} onClick={save}>{tk("common.save")}</button>
        {msg && <span className="text-[12px] text-ink-2">{msg}</span>}
      </div>

      {canAssign && (
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <label className="text-[11px] text-ink-2">{tk("admin.request.assignee")}
            <select className={input} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-ink-2">{tk("admin.request.slaDate")}
            <input type="date" className={`${input} num`} value={sla} onChange={(e) => setSla(e.target.value)} />
          </label>
          <button className={btnPrimary} disabled={pending || !assignee} onClick={() => run(() => assignRequestItem(item.id, { assigneeId: assignee, slaDate: sla }))}>
            {item.status === "assigned" || item.status === "sourcing" ? tk("admin.request.reassign") : tk("admin.request.assign")}
          </button>
        </div>
      )}

      {allowed.includes("needs_info") && (
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <select className={`${input} w-auto`} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {reasons.map((r) => <option key={r} value={r}>{tk(`needsInfo.reason.${r}`)}</option>)}
          </select>
          <input className={`${input} w-64`} placeholder={tk("admin.request.needsInfo.note")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          <button className={btn} disabled={pending} onClick={() => run(() => requestMoreInfo(item.id, { reason, note }))}>{tk("admin.request.needsInfo")}</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {allowed.includes("on_hold") && <button className={btn} disabled={pending} onClick={() => run(() => transitionRequestItem(item.id, "on_hold"))}>{tk("admin.request.hold")}</button>}
        {item.status === "assigned" && allowed.includes("received") && (
          <button className={btn} disabled={pending} onClick={() => run(() => transitionRequestItem(item.id, "received"))}>{tk("admin.request.unassign")}</button>
        )}
        {editable && siblings.length > 0 && (
          <span className="flex gap-1">
            <select className={`${input} w-auto`} value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}>
              {siblings.map((s) => <option key={s.id} value={s.id}>#{s.seq}</option>)}
            </select>
            <button className={btn} disabled={pending || !mergeTo} onClick={() => run(() => mergeRequestItems(item.id, mergeTo))}>{tk("admin.request.mergeInto")}</button>
          </span>
        )}
      </div>
    </div>
  );
}
