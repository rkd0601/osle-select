import { NextResponse, type NextRequest } from "next/server";
import { deliverDigests, deliverInstant } from "@/lib/notify-delivery";

/**
 * Vercel cron 진입점 (vercel.json). `Authorization: Bearer ${CRON_SECRET}`만 통과. 모든 알림은 notify()·배치를 거친다.
 * 8단계 계획의 나머지 job(sla·offers·fx·samples·cn_gate)은 같은 라우트에 붙인다.
 */
const JOBS: Record<string, () => Promise<unknown>> = {
  deliver: () => deliverInstant(),
  digest: () => deliverDigests(),
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  const run = JOBS[job];
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ job, result: await run() });
}
