import { listMyNotifications } from "@/lib/db/notifications";
import { NotificationList } from "@/components/domain/notification-list";

/** 관리자 알림 (레이아웃이 ADMIN 검증) */
export default async function AdminNotifications() {
  return <NotificationList rows={await listMyNotifications()} locale="ko" />;
}
