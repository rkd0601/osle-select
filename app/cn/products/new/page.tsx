import { requireRole } from "@/lib/auth/session";
import { getAssignedItemBrief, listRecentVendors } from "@/lib/db/cn/products";
import { t } from "@/lib/i18n/cn";
import { PageHeader } from "@/components/domain/page-header";
import { QuickForm } from "./quick-form";

/** C-02 상품 간단 등록. ?item=<request_item_id> 로 들어오면 요청 연결 자동(배정된 항목만). 디자인 v2: 760 한 칸. */
export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn/products/new");
  const actor = { id: u.id, role: u.role };
  const { item: itemId } = await searchParams;
  const [vendors, item] = await Promise.all([
    listRecentVendors(actor),
    itemId && /^[0-9a-f-]{36}$/.test(itemId) ? getAssignedItemBrief(actor, itemId) : Promise.resolve(null),
  ]);
  return (
    <div>
      <PageHeader title={t(u.locale, "product.new.title")} description={t(u.locale, "cn.new.desc")} />
      <QuickForm
        locale={u.locale}
        actorId={u.id}
        vendorLocked={u.role === "CN_VENDOR"}
        vendors={vendors}
        itemId={item?.id ?? null}
        itemLabel={item ? t(u.locale, "product.new.forItem", { seq: item.seq, desc: item.description_zh ?? "" }) : null}
      />
    </div>
  );
}
