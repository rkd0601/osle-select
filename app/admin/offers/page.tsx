import Link from "next/link";
import { listProductsForAdmin } from "@/lib/db/admin/products";
import { signedReadUrls } from "@/lib/storage";
import { StatusPill } from "@/components/domain/status-pill";
import { tk } from "@/lib/i18n";

/** A-04 제안 발행 · 상품 관리: 검수완료·제안중·재제안 풀 상품. 레이아웃이 ADMIN을 검증한다. */
export default async function AdminOffers() {
  const rows = await listProductsForAdmin(["reviewed", "repool", "offering"]);
  const covers = await signedReadUrls("productImages", rows.flatMap((r) => (r.cover ? [r.cover] : [])));
  return (
    <div>
      <h1 className="text-h2 font-bold">{tk("issue.title")}</h1>
      {rows.length === 0 ? (
        <p className="py-10 text-body text-muted">{tk("issue.empty")}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/offers/${p.id}`} className="block text-meta">
                {p.cover && covers[p.cover] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 비공개 버킷 서명 URL
                  <img src={covers[p.cover]} alt="" className="aspect-[3/4] w-full bg-sand object-cover" />
                ) : <span className="block aspect-[3/4] w-full bg-sand" />}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="num text-muted">{p.code ?? "—"}</span>
                  <StatusPill entity="product" status={p.status} />
                </div>
                <div className="truncate font-medium">{p.name_ko || p.name_zh}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
