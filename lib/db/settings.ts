import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, type SettingKey, type Settings } from "@/lib/config";

/**
 * settings 테이블(서비스 롤 전용) + 기본값. 브랜드 응답에 그대로 내보내지 않는다(fx·마진 포함).
 * PRD 5장 설정 키. 숫자 키는 DEFAULT_SETTINGS 타입을 따르고, 배열 키는 별도 함수로 읽는다.
 */
export async function getSettings(): Promise<Settings> {
  const { data } = await createAdminClient().from("settings").select("key, value");
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of data ?? []) {
    if (row.key in out && typeof row.value === "number") out[row.key as SettingKey] = row.value;
  }
  return out;
}

export async function getCategories(): Promise<string[]> {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", "categories").maybeSingle();
  return Array.isArray(data?.value) ? (data.value as string[]) : DEFAULT_CATEGORIES;
}
