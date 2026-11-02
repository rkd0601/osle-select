"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/lib/actions/notifications";

/** 모두 읽음 (라벨은 호출부가 로케일로 넘긴다) */
export function MarkReadButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="text-meta text-ink-2 underline-offset-4 hover:underline disabled:opacity-40" disabled={pending}
      onClick={() => start(async () => { await markNotificationsRead(); router.refresh(); })}>{label}</button>
  );
}
