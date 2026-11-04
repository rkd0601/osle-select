import { redirect } from "next/navigation";
import { requireBrandMember } from "@/lib/auth/session";

/**
 * 옛 B-12 주소 — 청구 화면이 흡수했다(DECISIONS d-6, 디자인 v2.2). 패키지 만들기·목록은 `/billing#packages`.
 * 멤버십 확인 뒤(다른 브랜드·없는 브랜드는 404). 패키지 생성 액션(actions.ts)·폼(export-form.tsx)은 이 폴더에 그대로 두고 청구가 쓴다.
 */
export default async function LegacyExports({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { brand } = await requireBrandMember(slug);
  redirect(`/b/${brand.slug}/billing#packages`);
}
