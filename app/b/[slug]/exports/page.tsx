import { requireBrandMember } from "@/lib/auth/session";
import { listExportCandidates, listExportPackages } from "@/lib/db/brand/exports";
import { signedReadUrls } from "@/lib/storage";
import { fmtDate } from "@/lib/format";
import { tk } from "@/lib/i18n";
import { ExportForm } from "./export-form";

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
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">{tk("export.title")}</h1>
        <p className="mt-2 text-[14px] text-ink-2">{tk("export.lead")}</p>
      </div>
      <ExportForm brandId={brand.id} candidates={cands.map((c) => ({ ...c, cover: c.cover ? covers[c.cover] ?? null : null }))} />
      <section>
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{tk("export.recent")}</h2>
        {pkgs.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">{tk("export.none")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line border-y border-line text-[13px]">
            {pkgs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="num w-28 text-muted">{fmtDate(p.created_at, "ko", true)}</span>
                <span className="font-medium">{tk(`export.shop.${p.shop_type}`)}</span>
                <span className="num text-ink-2">{(p.product_ids as string[]).map((id) => codeOf.get(id) ?? "").filter(Boolean).join(", ") || tk("export.products", { n: (p.product_ids as string[]).length })}</span>
                <span className="ml-auto flex gap-3">
                  {p.status === "ready"
                    ? ((p.files ?? []) as { kind: string; path: string }[]).filter((f) => own(f.path) && links[f.path]).map((f) => (
                        <a key={f.path} href={links[f.path]} className="text-signature underline-offset-4 hover:underline">{tk(`export.file.${f.kind}`)}</a>
                      ))
                    : <span className={p.status === "failed" ? "text-crit" : "text-muted"}>{tk(`export.status.${p.status}`)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-muted">{tk("export.help")}</p>
      </section>
    </div>
  );
}
