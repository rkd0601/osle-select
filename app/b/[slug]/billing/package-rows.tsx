import { signedReadUrls } from "@/lib/storage";
import { fmtDay } from "@/lib/format";
import { tk } from "@/lib/i18n";

/**
 * 청구 "쇼핑몰용 상품 파일" 행 (디자인 v2.2): 1px 룰 사이 — 이름 · 날짜 / 쇼핑몰 · 상품 수 / 파일 링크("패키지 zip" 등).
 * 다운로드 링크는 이 브랜드 접두어 경로만 서명한다(행의 files를 그대로 믿지 않는다 — 0039와 이중). 상태 점 없음(d-11).
 */
type Pkg = { id: string; product_ids: unknown; shop_type: string; files: unknown; status: string; created_at: string };

export async function PackageRows({ brandId, pkgs, names }: { brandId: string; pkgs: Pkg[]; names: Map<string, string | null> }) {
  if (!pkgs.length) return <p className="mt-4 text-meta text-ink-2">{tk("export.none")}</p>;
  const own = (path: string) => path.startsWith(`${brandId}/`) && !path.includes("..");
  const filesOf = (p: Pkg) => ((p.files ?? []) as { kind: string; path: string }[]).filter((f) => own(f.path));
  const links = await signedReadUrls("exports", pkgs.flatMap((p) => filesOf(p).map((f) => f.path)));
  return (
    <ul className="mt-3 border-t border-line">
      {pkgs.map((p) => {
        const ids = (p.product_ids ?? []) as string[];
        const first = ids.map((id) => names.get(id)).find(Boolean) ?? null;
        const title = first ? (ids.length > 1 ? `${first} ${tk("detail.more", { n: ids.length - 1 })}` : first) : tk("export.products", { n: ids.length });
        return (
          <li key={p.id} className="flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-3">
            <span className="min-w-0 flex-1 basis-56">
              <span className="block text-body font-medium">{title} · {fmtDay(p.created_at)}</span>
              <span className="block text-meta text-ink-2">{tk("billing.packageMeta", { shop: tk(`export.shop.${p.shop_type}`), n: ids.length })}</span>
            </span>
            <span className="flex flex-wrap gap-x-4 gap-y-2">
              {p.status === "ready"
                ? filesOf(p).filter((f) => links[f.path]).map((f) => <a key={f.path} href={links[f.path]} className="link">{tk(`export.file.${f.kind}`)}</a>)
                : <span className={`text-meta ${p.status === "failed" ? "text-crit" : "text-ink-2"}`}>{tk(`export.status.${p.status}`)}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
