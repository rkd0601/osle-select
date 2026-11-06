import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKETS } from "@/lib/config";
import { fetchLinkImage, fetchLinkMeta } from "@/lib/link-meta";

/**
 * 요청 접수 뒤(after) 링크 행마다 og:title · og:image를 채운다 (A3). 한 번만 시도(link_fetched_at).
 * 0057이 아직 없는 DB면 첫 select가 실패하고 조용히 끝난다 — 요청 접수에는 영향이 없다.
 * 이미지는 요청 이미지 버킷 `<brand>/og/<uuid>.<ext>`에 내려받는다(외부 이미지를 직접 걸지 않는다 — 만료·핫링크 차단).
 */
export async function enrichRequestLinks(requestId: string): Promise<{ done: number }> {
  const db = createAdminClient();
  const { data: rows, error } = await db
    .from("request_images")
    .select("id, brand_id, source_url, link_fetched_at")
    .eq("request_id", requestId)
    .not("source_url", "is", null)
    .is("link_fetched_at", null)
    .limit(40);
  if (error || !rows?.length) return { done: 0 };
  let done = 0;
  await Promise.all(
    rows.map(async (r) => {
      const meta = await fetchLinkMeta(r.source_url as string).catch(() => null);
      let imagePath: string | null = null;
      if (meta?.image) {
        const img = await fetchLinkImage(meta.image).catch(() => null);
        if (img) {
          const path = `${r.brand_id}/og/${randomUUID()}.${img.ext}`;
          const { error: ue } = await db.storage.from(BUCKETS.requestImages).upload(path, img.body, { contentType: img.type, upsert: false });
          if (!ue) imagePath = path;
        }
      }
      const { error: e2 } = await db
        .from("request_images")
        .update({ link_title: meta?.title ?? null, link_image_path: imagePath, link_fetched_at: new Date().toISOString() })
        .eq("id", r.id)
        .is("link_fetched_at", null);
      if (!e2 && (meta?.title || imagePath)) done++;
    }),
  );
  return { done };
}
