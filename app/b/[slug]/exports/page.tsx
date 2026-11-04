import { requireBrandMember } from "@/lib/auth/session";
import { listExportCandidates, listExportPackages } from "@/lib/db/brand/exports";
import { signedReadUrls } from "@/lib/storage";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ExportForm } from "./export-form";
import { PageHeader } from "@/components/domain/page-header";

/**
 * B-12 쇼핑몰로 상품 보내기 — 위아더 표준 패키지(README·CSV 3종·상세 HTML·JPG 사진 zip, DECISIONS 9-5) + 참고용 쇼핑몰 프리셋. 대상은 발주 확정·샘플 채택 상품.
 * 다운로드 링크는 이 브랜드 접두어 경로만 서명한다(행의 files를 그대로 믿지 않는다 — 0039와 이중).
 */
export const maxDuration = 60; // 패키지 생성 서버 액션이 이 라우트에서 실행된다 — 사진 다운로드·zip 시간

export default async function ExportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const [cands, pkgs] = await Promise.all([listExportCandidates(brand.id), listExportPackages(brand.id)]);
  const covers = await signedReadUrls("productImages", cands.map((c) => c.cover).filter(Boolean) as string[]);
  const own = (path: string) => path.startsWith(`${brand.id}/`) && !path.includes("..");
  const paths = pkgs.flatMap((p) => ((p.files ?? []) as { kind: string; path: string }[]).map((f) => f.path)).filter(own);
  const links = await signedReadUrls("exports", paths);
  const codeOf = new Map(cands.map((c) => [c.productId, c.code]));
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <PageHeader eyebrow={tk("eyebrow.exports")} title={tk("export.title")} count={cands.length || null} description={tk("export.lead")} />
      <ExportForm brandId={brand.id} candidates={cands.map((c) => ({ ...c, cover: c.cover ? covers[c.cover] ?? null : null }))} />
      <section>
        <div className="flex items-baseline justify-between border-b border-ink pb-2">
          <h2 className="text-h4 font-bold">{tk("export.recent")}</h2>
          {pkgs.length > 0 && <span className="num text-caption text-ink-2">{pkgs.length}</span>}
        </div>
        {pkgs.length === 0 ? (
          <p className="mt-3 text-body text-ink-2">{tk("export.none")}</p>
        ) : (
          <ul className="card mt-4 divide-y divide-line overflow-hidden text-body">
            {pkgs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="num w-28 shrink-0 text-meta text-ink-2">{fmtDate(p.created_at, "ko", true)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{tk(`export.shop.${p.shop_type}`)}</span>
                  <span className="num block truncate text-meta text-ink-2">{(p.product_ids as string[]).map((id) => codeOf.get(id) ?? "").filter(Boolean).join(", ") || tk("export.products", { n: (p.product_ids as string[]).length })}</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {p.status === "ready"
                    ? ((p.files ?? []) as { kind: string; path: string }[]).filter((f) => own(f.path) && links[f.path]).map((f) => (
                        <a key={f.path} href={links[f.path]} className="btn btn-secondary btn-sm">{tk(`export.file.${f.kind}`)}</a>
                      ))
                    : <span className={`rounded-full px-2 py-0.5 text-caption font-medium ${p.status === "failed" ? "bg-crit-soft text-crit" : "bg-sand text-ink-2"}`}>{tk(`export.status.${p.status}`)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-meta text-ink-2">{tk("export.help")}</p>
      </section>
    </div>
  );
}
