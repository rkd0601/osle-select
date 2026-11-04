import { requireBrandMember } from "@/lib/auth/session";
import { listExportCandidates, listExportPackages } from "@/lib/db/brand/exports";
import { signedReadUrls } from "@/lib/storage";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ExportForm } from "./export-form";
import { PageHeader } from "@/components/domain/page-header";

/**
 * B-12 쇼핑몰로 상품 보내기 — 위아더 표준 패키지(README·CSV 3종·상세 HTML·JPG 사진 zip, DECISIONS 9-5) + 참고용 쇼핑몰 프리셋. 대상은 발주 확정·샘플 채택 상품.
 * 디자인 v2: 룰 사이 행, 상자 없음. 다운로드 링크는 이 브랜드 접두어 경로만 서명한다(행의 files를 그대로 믿지 않는다 — 0039와 이중).
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
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={tk("eyebrow.exports")} title={tk("export.title")} count={cands.length || null} description={tk("export.lead")} />
      <ExportForm brandId={brand.id} candidates={cands.map((c) => ({ ...c, cover: c.cover ? covers[c.cover] ?? null : null }))} />
      <section className="section">
        <div className="section-h">
          <h2>{tk("export.recent")}{pkgs.length > 0 && <span className="count">{pkgs.length}</span>}</h2>
        </div>
        {pkgs.length === 0 ? (
          <p className="mt-4 text-meta text-ink-2">{tk("export.none")}</p>
        ) : (
          <ul className="text-body">
            {pkgs.map((p) => (
              <li key={p.id} className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 border-b border-line py-3.5">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block text-lead font-medium">{tk(`export.shop.${p.shop_type}`)}</span>
                  <span className="num block truncate text-meta text-muted">
                    {fmtDate(p.created_at, "ko", true)} · {(p.product_ids as string[]).map((id) => codeOf.get(id) ?? "").filter(Boolean).join(", ") || tk("export.products", { n: (p.product_ids as string[]).length })}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {p.status === "ready"
                    ? ((p.files ?? []) as { kind: string; path: string }[]).filter((f) => own(f.path) && links[f.path]).map((f) => (
                        <a key={f.path} href={links[f.path]} className="btn sec sm">{tk(`export.file.${f.kind}`)}</a>
                      ))
                    : <span className={`st ${p.status === "failed" ? "crit" : "wait"}`}>{tk(`export.status.${p.status}`)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-caption text-muted">{tk("export.help")}</p>
      </section>
    </div>
  );
}
