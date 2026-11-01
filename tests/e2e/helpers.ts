import { expect, type Page, test } from "@playwright/test";

/** 시드 계정 (supabase/seed.sql). 비밀번호는 로컬 시드 전용. */
export const SEED = {
  password: process.env.E2E_PASSWORD ?? "password123",
  brandAOwner: "owner@osle-muz.example",
  brandAMember: "md@osle-muz.example",
  brandBOwner: "owner@brand-b.example",
  admin: "admin@wearethe.co.kr",
  cnSourcer: "cn.wang@wearethe.co.kr",
  brandA: "osle-muz",
  brandB: "brand-b",
  brandARequestId: "30000000-0000-0000-0000-000000000001",
  brandAOfferId: "70000000-0000-0000-0000-000000000001",
} as const;

/** 브랜드 응답에 절대 나오면 안 되는 키 (PRD 11장 보안 테스트) */
export const FORBIDDEN_KEYS = /cost_cny|vendor_code|vendor_id|hidden_margin|fx_rate|weight_g|booth|source_market|assigned_to|[a-z]_zh\b|"tiers"/;

export const requireEnv = () => test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL 없음 — Supabase 연결 후 실행");

/** P-02 직원 로그인 폼(이메일+비밀번호)으로 로그인. 브랜드 시드 계정도 비밀번호가 있어 같은 폼을 쓴다. */
export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: /위아더 · 중국 담당자 로그인/ }).click();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(SEED.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
