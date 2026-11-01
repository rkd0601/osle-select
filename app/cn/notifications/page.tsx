import { requireRole } from "@/lib/auth/session";
import { listMyNotifications } from "@/lib/db/notifications";
import { NotificationList } from "@/components/domain/notification-list";

/** CN 알림 (zh-CN). WeCom으로도 같은 제목이 간다 */
export default async function CnNotifications() {
  const u = await requireRole(["CN_SOURCER", "CN_VENDOR", "ADMIN"], "/cn/notifications");
  return <NotificationList rows={await listMyNotifications()} locale={u.locale} />;
}
