import Link from "next/link";
import { SERVICE } from "@/lib/config";
import { tk } from "@/lib/i18n";
import { ApplyForm } from "./apply-form";

/** P-01 브랜드 신청 — 위아더가 검토 후 초대 메일을 보낸다 */
export default function ApplyPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Link href="/" className="text-[12px] text-muted">{SERVICE.name}</Link>
      <h1 className="mt-3 text-[28px] font-bold tracking-tight">{tk("apply.title")}</h1>
      <p className="mt-2 text-[14px] text-ink-2">{tk("apply.lead")}</p>
      <div className="mt-8"><ApplyForm /></div>
    </main>
  );
}
