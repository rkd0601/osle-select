import { requireBrandMember } from "@/lib/auth/session";
import { listMyNotifications } from "@/lib/db/notifications";
import { NotificationList } from "@/components/domain/notification-list";

/** 브랜드 알림 (본인 것만 — RLS). slug 검증은 레이아웃 */
export default async function BrandNotifications({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireBrandMember(slug);
  return <NotificationList rows={await listMyNotifications()} locale="ko" />;
}
