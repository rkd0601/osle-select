"use server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

/** P-01 브랜드 신청 (비로그인). 서비스 롤로 넣고 관리자에게 즉시 알림. 봇 방지는 숨은 칸(honeypot) + 길이 제한 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const Apply = z.object({
  brandName: z.string().trim().min(1).max(60),
  type: z.enum(["influencer", "brand"]),
  channels: z.array(z.string().trim().url().max(300)).min(1).max(5),
  categoryFocus: z.array(z.string().trim().max(20)).max(8).default([]),
  followerScale: z.enum(["lt10k", "10k_50k", "50k_200k", "gt200k", "na"]).default("na"),
  contactName: z.string().trim().min(1).max(40),
  contactEmail: z.string().trim().email().max(120),
  contactPhone: z.string().trim().max(30).optional().or(z.literal("")),
  bizRegNo: z.string().trim().max(20).optional().or(z.literal("")),
  ecommerce: z.boolean().default(false),
  cnContentOptin: z.boolean().default(false),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
  website: z.string().max(0).optional().or(z.literal("")), // honeypot — 사람은 비워 둔다
});

export async function submitApplication(input: unknown): Promise<Result<null>> {
  const parsed = Apply.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path[0] === "channels" ? "apply.error.channels" : "common.invalid" };
  const v = parsed.data;
  const db = createAdminClient();
  // 같은 이메일로 대기 중 신청이 있으면 새로 만들지 않는다
  const { data: dup } = await db.from("brand_applications").select("id").eq("contact_email", v.contactEmail.toLowerCase()).eq("status", "pending").limit(1);
  if (dup?.length) return { ok: true, data: null };
  const { data, error } = await db.from("brand_applications").insert({
    brand_name: v.brandName, type: v.type, channels: v.channels, category_focus: v.categoryFocus, follower_scale: v.followerScale,
    contact_name: v.contactName, contact_email: v.contactEmail.toLowerCase(), contact_phone: v.contactPhone || null, biz_reg_no: v.bizRegNo || null,
    is_ecommerce_registered: v.ecommerce, cn_content_optin: v.cnContentOptin, note: v.note || null,
  }).select("id").single();
  if (error || !data) return { ok: false, error: "common.error" };
  await notify({ type: "brand.applied", applicationId: data.id, brandName: v.brandName });
  return { ok: true, data: null };
}
