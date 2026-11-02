import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { tk } from "@/lib/i18n";
import { countOpenBrandItems } from "@/lib/db/brand/requests";

/** B-01 브랜드 홈 (2단계 골격). "지금 당신 차례" 카드는 3단계부터 실제 데이터로 채운다. */
export default async function BrandHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const supabase = await createClient();
  const [{ count: offers }, items] = await Promise.all([
    supabase.from("v_offers_brand").select("id", { count: "exact", head: true }).eq("brand_id", brand.id).eq("status", "new"),
    countOpenBrandItems(brand.id),
  ]);
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <section>
        <h1 className="text-h1-s font-bold tracking-tight">{tk("home.yourTurn")}</h1>
        <div className="mt-4 rounded-ui border border-line bg-surface p-5 text-lead text-ink-2">
          {offers ? (
            <>{tk("home.newOffers", { n: offers })} <Link className="text-signature underline-offset-4 hover:underline" href={`/b/${slug}/offers`}>{tk("home.viewLinesheet")}</Link></>
          ) : tk("home.empty")}
        </div>
      </section>
      <aside className="space-y-4">
        <Link href={`/b/${slug}/requests/new`} className="block rounded-ui bg-ink px-4 py-3 text-center text-lead font-medium text-paper">{tk("home.request")}</Link>
        <div className="rounded-ui border border-line bg-surface p-4 text-body">
          <div className="text-muted">{tk("home.openItems")}</div>
          <div className="num mt-1 text-h1-s font-semibold">{items}</div>
        </div>
      </aside>
    </div>
  );
}
