import type { Prepared } from "./image";

async function put(url: string, body: Blob) {
  console.log("[uploadEntry:put] Uploading blob to R2:", { size: body.size, type: body.type });
  const res = await fetch(url, {
    method: "PUT",
    body,
    headers: { "Content-Type": body.type || "image/webp" },
  });
  if (!res.ok) throw new Error(`upload to R2 failed (${res.status})`);
  console.log("[uploadEntry:put] Successfully uploaded to R2");
}

export async function uploadEntry(
  p: Prepared,
  lat: number,
  lng: number,
  source: "exif" | "manual",
): Promise<"created" | "duplicate"> {
  const takenAt = p.takenAt.toISOString();

  console.log("[uploadEntry] Starting upload:", {
    takenAt,
    lat,
    lng,
    source,
    photoSize: p.photo.size,
    thumbSize: p.thumb.size,
  });

  const signRes = await fetch("/api/admin/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ takenAt }),
  });
  if (!signRes.ok) {
    throw new Error(signRes.status === 401 ? "admin login required" : "couldn't get an upload URL");
  }
  const { photoKey, thumbKey, photoUploadUrl, thumbUploadUrl } = await signRes.json();
  console.log("[uploadEntry] Got signed URLs:", { photoKey, thumbKey });

  await Promise.all([put(photoUploadUrl, p.photo), put(thumbUploadUrl, p.thumb)]);
  console.log("[uploadEntry] Files uploaded to R2");

  const res = await fetch("/api/admin/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ takenAt, lat, lng, source, photoKey, thumbKey }),
  });
  if (!res.ok) throw new Error("couldn't save the entry");

  const body = await res.json();
  console.log("[uploadEntry] Entry saved:", { duplicate: body.duplicate, entryId: body.entry?.id });
  return body.duplicate ? "duplicate" : "created";
}
