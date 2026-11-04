import { listMyNotifications } from "@/lib/db/notifications";
import { NotificationList } from "@/components/domain/notification-list";

/** 관리자 알림 (레이아웃이 ADMIN 검증). 목록 머리·읽음 처리는 공통 컴포넌트가 그린다 — 읽기 좋은 폭으로만 감싼다 */
export default async function AdminNotifications() {
  return <div className="max-w-3xl"><NotificationList rows={await listMyNotifications()} locale="ko" /></div>;
}
