import { redirect } from "next/navigation";
import { requireBrandMember } from "@/lib/auth/session";

/** 옛 목록 주소 — 메뉴 넷(DECISIONS d-6)으로 "진행" 화면의 해당 칩으로 보낸다. 상세 [id] 주소는 그대로. 멤버십 확인 뒤(다른 브랜드는 404) */
export default async function LegacyRequestsList({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  redirect(`/b/${brand.slug}/progress`);
}
