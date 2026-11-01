import { Body, Container, Head, Html, Link, Preview, Section, Text } from "@react-email/components";
import { t, type Locale } from "@/lib/i18n";
import { SERVICE } from "@/lib/config";

/**
 * 알림 메일 (instant 1건 / digest 묶음 공용). 금액·원가는 넣지 않는다 — 링크로 들어가 보게(원가 비노출 이중 방어).
 * 문구는 i18n 템플릿(규칙 10). 폰트는 시스템 기본(메일 클라이언트 호환).
 */
export function NoticeEmail({ locale, heading, lines, url }: { locale: Locale; heading: string; lines: { title: string; count: number; href: string | null }[]; url: string }) {
  const ink = "#16140f";
  return (
    <Html lang={locale === "zh-CN" ? "zh-CN" : "ko"}>
      <Head />
      <Preview>{heading}</Preview>
      <Body style={{ background: "#f6f4ef", fontFamily: "-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif", color: ink }}>
        <Container style={{ maxWidth: 520, margin: "0 auto", padding: "32px 24px", background: "#ffffff" }}>
          <Text style={{ fontSize: 12, color: "#8a857a", margin: 0 }}>{SERVICE.name}</Text>
          <Text style={{ fontSize: 20, fontWeight: 700, margin: "8px 0 16px" }}>{heading}</Text>
          <Section style={{ borderTop: `1px solid ${ink}` }}>
            {lines.map((l, i) => (
              <Text key={i} style={{ fontSize: 14, margin: 0, padding: "10px 0", borderBottom: "1px solid #e6e2d8" }}>
                {l.href ? <Link href={l.href} style={{ color: ink }}>{l.title}</Link> : l.title}
                {l.count > 1 ? ` · ${t(locale, "email.count", { n: l.count })}` : ""}
              </Text>
            ))}
          </Section>
          <Link href={url} style={{ display: "inline-block", marginTop: 20, padding: "12px 20px", background: ink, color: "#ffffff", fontSize: 14, textDecoration: "none" }}>
            {t(locale, "email.cta")}
          </Link>
          <Text style={{ fontSize: 11, color: "#8a857a", marginTop: 24 }}>{t(locale, "email.footer", { company: SERVICE.company })}</Text>
        </Container>
      </Body>
    </Html>
  );
}
