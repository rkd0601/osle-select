/**
 * 서명 URL 직접 업로드 (브라우저). supabase-js 없이 fetch 한 번 — /cn 초기 JS 200KB 예산(PRD 11장) 때문에 클라이언트 번들에서 뺐다.
 * storage-js `uploadToSignedUrl`과 같은 엔드포인트·헤더(raw body). 서버가 경로를 발급·검증하므로 토큰만 있으면 된다.
 */
export async function uploadToSignedUrl(bucket: string, path: string, token: string, body: Blob): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  const url = new URL(`${base}/storage/v1/object/upload/sign/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`);
  url.searchParams.set("token", token);
  try {
    const res = await fetch(url, {
      method: "PUT",
      body,
      headers: {
        "content-type": body.type || "image/webp",
        "cache-control": "max-age=3600",
        "x-upsert": "false",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}
