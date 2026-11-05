import Link from "next/link";
import { requireBrandMember } from "@/lib/auth/session";
import { tk } from "@/lib/i18n";
import { ServiceGuide } from "@/components/domain/service-guide";
import { BackLink } from "../_ui/list";

/**
 * 설정 › 이용 안내 (v2.3 · DECISIONS d-12) — 새 브랜드 첫 화면과 같은 내용을 상시로. 멤버십 확인(다른 브랜드는 404).
 * 머리 8(제목 · 한 문장 · 첫 요청 버튼) → 4단계 → 자주 묻는 것 → 예시 요청(#example).
 */
export default async function HelpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  const base = `/b/${brand.slug}`;
  return (
    <div className="g12">
      <div className="c12"><BackLink href={`${base}/settings`} label={tk("nav.settings")} /></div>
      <div className="c8">
        <h1 className="h1">{tk("help.title")}</h1>
        <p className="lead" style={{ marginTop: 12, maxWidth: "46ch" }}>{tk("help.lead")}</p>
      </div>
      <div className="c4 tr at-h1"><Link href={`${base}/requests/new`} className="btn">{tk("home.request")}</Link></div>

      <ServiceGuide />

      <div id="example" className="c12 section-h"><h2>{tk("help.example.title")}</h2></div>
      <div className="c8">
        <dl className="kvl">
          {(["photo", "desc", "qty", "price", "memo"] as const).map((k) => (
            <div key={k} className="contents"><dt>{tk(`help.example.${k}.k`)}</dt><dd>{tk(`help.example.${k}.v`)}</dd></div>
          ))}
        </dl>
        <p className="text-meta text-ink-2" style={{ marginTop: 12 }}>{tk("help.example.note")}</p>
      </div>
    </div>
  );
}
