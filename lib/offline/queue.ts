/**
 * C-02 오프라인 큐 (CLAUDE.md 코딩 규칙: /cn은 IndexedDB 오프라인 큐). 브라우저 전용, 외부 의존 없음.
 * 시장 안에서 업로드·저장이 실패하면 사진(Blob)과 입력을 기기에 보관하고, 연결되면 같은 productId로 재전송한다
 * (서버 createQuickProduct가 productId 기준 멱등). 사진은 올린 경로를 entry에 기록해 다시 올리지 않는다.
 */
const DB = "osle-cn";
const STORE = "quick-products";

export type QueueEntry = {
  productId: string;
  createdAt: number;
  input: Record<string, unknown>; // QuickProductInput에서 imagePaths만 뺀 값
  blobs: Blob[];
  uploaded: (string | null)[]; // blobs와 같은 순서, 업로드 끝난 경로
  vendorCard?: Blob | null;
  vendorCardPath?: string | null;
  lastError?: string;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "productId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const putEntry = (e: QueueEntry) => tx("readwrite", (s) => s.put(e));
export const removeEntry = (productId: string) => tx("readwrite", (s) => s.delete(productId));
export const listEntries = () => tx<QueueEntry[]>("readonly", (s) => s.getAll() as IDBRequest<QueueEntry[]>);

export type Uploader = {
  /** blob → 저장 경로 (서명 URL 직접 업로드, 실패 시 프록시) */
  uploadProductImage: (productId: string, blob: Blob) => Promise<string>;
  uploadVendorCard: (blob: Blob) => Promise<string>;
  create: (input: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * 큐 한 건 처리. 진행 상황(올린 경로)을 매 단계 저장하므로 중간에 끊겨도 이어서 한다.
 * 서버가 입력 자체를 거부(검증 오류)하면 재시도해도 소용없으므로 lastError를 남기고 큐에 둔다(사용자가 확인).
 */
export async function flushEntry(e: QueueEntry, up: Uploader): Promise<"done" | "retry" | "rejected"> {
  try {
    for (let i = 0; i < e.blobs.length; i++) {
      if (e.uploaded[i]) continue;
      e.uploaded[i] = await up.uploadProductImage(e.productId, e.blobs[i]);
      await putEntry(e);
    }
    if (e.vendorCard && !e.vendorCardPath) {
      e.vendorCardPath = await up.uploadVendorCard(e.vendorCard);
      await putEntry(e);
    }
    const input: Record<string, unknown> = { ...e.input, productId: e.productId, imagePaths: e.uploaded };
    if (e.vendorCardPath && input.newVendor) input.newVendor = { ...(input.newVendor as object), cardImagePath: e.vendorCardPath };
    const res = await up.create(input);
    if (res.ok) {
      await removeEntry(e.productId);
      return "done";
    }
    e.lastError = res.error;
    await putEntry(e);
    return res.error === "common.error" ? "retry" : "rejected";
  } catch {
    return "retry"; // 네트워크 — 다음 online 이벤트에
  }
}

export async function flushAll(up: Uploader): Promise<{ done: number; left: number }> {
  let done = 0;
  const entries = await listEntries().catch(() => [] as QueueEntry[]);
  for (const e of entries.sort((a, b) => a.createdAt - b.createdAt)) if ((await flushEntry(e, up)) === "done") done++;
  return { done, left: (await listEntries().catch(() => [])).length };
}
