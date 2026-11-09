"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { markPathRead } from "@/lib/actions/notifications";

/**
 * 영역 레이아웃에 한 번. 화면을 옮길 때마다 그 화면을 가리키는 읽지 않은 알림을 읽음으로 바꾼다(사이트 수정 7·8).
 * 바뀐 게 있으면 새로 그려 메뉴 알림 수·"새 소식" 칩을 맞춘다. 화면에는 아무것도 그리지 않는다.
 */
export function SeenOnVisit() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!pathname) return;
    let live = true;
    markPathRead(pathname).then((r) => { if (live && r.ok && r.data > 0) router.refresh(); }).catch(() => {});
    return () => { live = false; };
  }, [pathname, router]);
  return null;
}
