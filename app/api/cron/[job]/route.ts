import { NextResponse, type NextRequest } from "next/server";
import { deliverDigests, deliverInstant } from "@/lib/notify-delivery";
import { cnGateJob, fxJob, offersJob, ordersJob, samplesJob, slaJob } from "@/lib/cron-jobs";
import { bearerOk } from "@/lib/auth/bearer";

/**
 * Vercel cron 진입점 (vercel.json). `Authorization: Bearer ${CRON_SECRET}`만 통과(상수 시간 비교). 모든 알림은 notify()·배치를 거친다.
 */
const JOBS: Record<string, () => Promise<unknown>> = {
  deliver: () => deliverInstant(),
  digest: () => deliverDigests(),
  sla: () => slaJob(),
  offers: () => offersJob(),
  fx: () => fxJob(),
  samples: () => samplesJob(),
  cn_gate: () => cnGateJob(),
  orders: () => ordersJob(),
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!bearerOk(req.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  const run = JOBS[job];
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ job, result: await run() });
}
