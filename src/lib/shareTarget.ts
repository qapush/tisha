// Reads back the files the service worker stashed in Cache Storage when the
// user shared photos into the installed PWA (see public/sw.js). Consuming
// clears the cache so a stray revisit to /?share=1 doesn't reprocess them.
const SHARE_CACHE = "share-target-v1";

export async function consumeSharedFiles(): Promise<File[]> {
  if (typeof caches === "undefined") return [];

  const cache = await caches.open(SHARE_CACHE);
  const manifestRes = await cache.match("/__share/manifest");
  if (!manifestRes) return [];
  const { count } = (await manifestRes.json()) as { count: number };

  const files: File[] = [];
  for (let i = 0; i < count; i++) {
    const key = `/__share/file-${i}`;
    const res = await cache.match(key);
    if (!res) continue;
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get("X-File-Name") ?? `shared-${i}`);
    const type = res.headers.get("Content-Type") ?? blob.type;
    const lastModified = Number(res.headers.get("X-Last-Modified")) || Date.now();
    files.push(new File([blob], name, { type, lastModified }));
    await cache.delete(key);
  }
  await cache.delete("/__share/manifest");
  return files;
}
