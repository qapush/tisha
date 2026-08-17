// Exists for exactly one reason: registering a service worker is a
// prerequisite for the site to be installable as a PWA, which is in turn a
// prerequisite for share_target (see manifest.json) to show up in the
// system "Share" sheet. No offline caching here on purpose — caching the
// Next.js build output would risk serving a stale app shell after a
// redeploy, which is worse than the app simply requiring network.

const SHARE_CACHE = "share-target-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShareTarget(event.request));
  }
  // Everything else: don't call respondWith, let the browser handle it normally.
});

/**
 * Stashes shared files in the Cache API (never reaches our server — Vercel's
 * request body limit doesn't apply here) and redirects to a page that reads
 * them back out and feeds them through the normal upload pipeline.
 */
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("photos").filter((f) => f instanceof File);
    const cache = await caches.open(SHARE_CACHE);

    await Promise.all(
      files.map((file, i) =>
        cache.put(
          `/__share/file-${i}`,
          new Response(file, {
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              "X-File-Name": encodeURIComponent(file.name || `shared-${i}`),
              "X-Last-Modified": String(file.lastModified || Date.now()),
            },
          }),
        ),
      ),
    );
    await cache.put(
      "/__share/manifest",
      new Response(JSON.stringify({ count: files.length }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch (err) {
    console.error("[sw] share-target failed", err);
  }
  return Response.redirect("/?share=1", 303);
}
