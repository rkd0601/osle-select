import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/domain/page-header";
import { FilterTabs, withQuery } from "@/components/domain/filter-tabs";
import { SearchBox } from "@/components/domain/search-box";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n/admin";
import { ListEmpty, Section, TBL, Toolbar, matchQ, sp, type SearchParams } from "../_ui/ui";
import { VendorForm, type VendorRow } from "./vendor-form";
import { WebhookForm } from "./webhook-form";
import { listUsersByRole } from "@/lib/db/users";

/**
 * A-08 원청 관리(일부): 목록·생성·기본값 수정. 레이아웃이 ADMIN을 검증한다. 원청은 브랜드에 절대 노출되지 않는다.
 * 목록이 먼저, 추가(?new=1)·수정(?edit=)은 위쪽 카드로 연다. 칩 = 전체 / WeCom 웹훅 없음, 검색 = 이름·시장·부스·위챗.
 */
export default async function AdminVendors({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const p = await searchParams;
  const edit = sp(p.edit);
  const creating = sp(p.new) === "1";
  const q = sp(p.q);
  const filter = sp(p.f) === "nohook" ? "nohook" : "all";
  const db = createAdminClient();
  const [{ data: vendors }, { data: counts }, { data: channels }] = await Promise.all([
    db.from("vendors").select("id, name, market, booth, wechat, notes, trust_score, owner_profile_id, default_hold, default_sample_ok, default_label_options, default_mod_options, updated_at").order("updated_at", { ascending: false }).limit(300),
    db.from("products").select("vendor_id").not("vendor_id", "is", null).limit(5000),
    // 웹훅 키는 화면에 내리지 않는다 — 설정 여부만 (DECISIONS r6-4)
    db.from("vendor_channels").select("vendor_id").not("wecom_webhook", "is", null),
  ]);
  const hooked = new Set((channels ?? []).map((c) => c.vendor_id));
  const n = new Map<string, number>();
  for (const c of counts ?? []) n.set(c.vendor_id, (n.get(c.vendor_id) ?? 0) + 1);
  const editing = (vendors ?? []).find((v) => v.id === edit) as VendorRow | undefined;
  const vendorUsers = await listUsersByRole(["CN_VENDOR"]);
  const list = vendors ?? [];
  const noHook = (v: (typeof list)[number]) => !!v.owner_profile_id && !hooked.has(v.id);
  const scoped = list.filter((v) => matchQ(q, v.name, v.market, v.booth, v.wechat));
  const rows = filter === "nohook" ? scoped.filter(noHook) : scoped;
  const cur = { q, f: filter === "all" ? undefined : filter };

  return (
    <div>
      <PageHeader eyebrow={tk("admin.nav.group.manage")} title={tk("admin.vendors.title")} count={list.length}
        actions={!creating && !editing ? <Link href={withQuery("/admin/vendors", cur, { new: "1" })} className="btn">{tk("admin.vendors.new")}</Link> : null} />

      {(creating || editing) && (
        <Section className="mb-12" title={editing ? `${editing.name} · ${tk("admin.vendors.edit")}` : tk("admin.vendors.new")}
          actions={<Link href={withQuery("/admin/vendors", cur, {})} className="link">{tk("common.close")}</Link>}>
          <VendorForm key={editing?.id ?? "new"} vendor={editing ?? null} vendorUsers={vendorUsers.map((u) => ({ id: u.id, email: u.email }))} />
          {editing && <div className="mt-10 border-t border-line pt-6"><WebhookForm key={`hook-${editing.id}`} vendorId={editing.id} isSet={hooked.has(editing.id)} /></div>}
        </Section>
      )}

      <section>
        <Toolbar end={
          <FilterTabs variant="chips" label={tk("admin.ui.tabsLabel")} active={filter}
            tabs={[
              { key: "all", label: tk("admin.ui.all"), count: scoped.length, href: withQuery("/admin/vendors", cur, { f: null }) },
              { key: "nohook", label: tk("admin.vendors.wecomMissing"), count: scoped.filter(noHook).length, href: withQuery("/admin/vendors", cur, { f: "nohook" }) },
            ]} />
        }>
          <SearchBox className="w-full max-w-sm" placeholder={tk("admin.vendors.searchPh")} label={tk("admin.ui.search")} />
        </Toolbar>
        {rows.length === 0 ? (
          <ListEmpty filtered={!!(q || filter !== "all")} resetHref="/admin/vendors" title={tk("admin.vendors.empty")} />
        ) : (
          <table className={TBL}>
            <thead>
              <tr>
                <th>{tk("product.vendor.name")}</th>
                <th>{tk("product.vendor.market")}</th>
                <th>{tk("product.detail.hold")}</th>
                <th className="r">{tk("admin.vendors.col.products")}</th>
                <th className="r">{tk("admin.vendors.trust")}</th>
                <th className="r">{tk("admin.offers.col.updated")}</th>
                <th><span className="sr-only">{tk("admin.vendors.edit")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const h = v.default_hold as { none?: boolean; deposit_pct?: number; days?: number };
                return (
                  <tr key={v.id} className={v.id === edit ? "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-ink [&>td:first-child]:pl-3" : ""}>
                    <td>
                      {noHook(v) && <span className="code text-warn">{tk("admin.vendors.wecomMissing")}</span>}
                      <span className="font-medium">{v.name}</span>{v.booth && <span className="text-ink-2"> · {v.booth}</span>}
                    </td>
                    <td className="text-ink-2">{v.market ?? "-"}</td>
                    <td className="text-meta text-ink-2">{h?.none ? tk("product.detail.hold.none") : tk("product.detail.hold.deposit", { pct: Math.round((h?.deposit_pct ?? 0) * 100), days: h?.days ?? 0 })}</td>
                    <td className="r">{n.get(v.id) ?? 0}</td>
                    <td className="r">{v.trust_score ?? "-"}</td>
                    <td className="r text-meta text-muted">{fmtDate(v.updated_at)}</td>
                    <td className="text-right"><Link href={withQuery("/admin/vendors", cur, { edit: v.id })} className="btn sec sm">{tk("admin.vendors.edit")}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
