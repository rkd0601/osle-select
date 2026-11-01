import { createAdminClient } from "@/lib/supabase/admin";
import { tk } from "@/lib/i18n";
import { VendorForm, type VendorRow } from "./vendor-form";

/** A-08 원청 관리(일부): 목록·생성·기본값 수정. 레이아웃이 ADMIN을 검증한다. 원청은 브랜드에 절대 노출되지 않는다. */
export default async function AdminVendors({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const db = createAdminClient();
  const [{ data: vendors }, { data: counts }] = await Promise.all([
    db.from("vendors").select("id, name, market, booth, wechat, notes, trust_score, default_hold, default_sample_ok, default_label_options, default_mod_options, updated_at").order("updated_at", { ascending: false }).limit(300),
    db.from("products").select("vendor_id").not("vendor_id", "is", null).limit(5000),
  ]);
  const n = new Map<string, number>();
  for (const c of counts ?? []) n.set(c.vendor_id, (n.get(c.vendor_id) ?? 0) + 1);
  const editing = (vendors ?? []).find((v) => v.id === edit) as VendorRow | undefined;
  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-[20px] font-bold">{tk("admin.vendors.title")}</h1>
      <section>
        <h2 className="mb-2 text-[13px] font-semibold">{editing ? `${editing.name} · ${tk("admin.vendors.edit")}` : tk("admin.vendors.new")}</h2>
        <VendorForm key={editing?.id ?? "new"} vendor={editing ?? null} />
      </section>
      {(vendors ?? []).length === 0 ? (
        <p className="text-[13px] text-muted">{tk("admin.vendors.empty")}</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead className="text-left text-[11px] text-ink-2">
            <tr><th className="py-2">{tk("product.vendor.name")}</th><th>{tk("product.vendor.market")}</th><th>{tk("product.detail.hold")}</th><th>{tk("admin.vendors.trust")}</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(vendors ?? []).map((v) => {
              const h = v.default_hold as { none?: boolean; deposit_pct?: number; days?: number };
              return (
                <tr key={v.id} className="bg-surface">
                  <td className="py-2">{v.name}{v.booth ? ` · ${v.booth}` : ""}<div className="text-[11px] text-muted">{tk("admin.vendors.products", { n: n.get(v.id) ?? 0 })}</div></td>
                  <td className="text-ink-2">{v.market ?? "-"}</td>
                  <td className="text-ink-2">{h?.none ? tk("product.detail.hold.none") : tk("product.detail.hold.deposit", { pct: Math.round((h?.deposit_pct ?? 0) * 100), days: h?.days ?? 0 })}</td>
                  <td className="num">{v.trust_score ?? "-"}</td>
                  <td className="text-right"><a href={`/admin/vendors?edit=${v.id}`} className="text-signature">{tk("admin.vendors.edit")}</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
