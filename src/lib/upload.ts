import type { Prepared } from "./image";

async function put(url: string, body: Blob) {
  const res = await fetch(url, {
    method: "PUT",
    body,
    headers: { "Content-Type": body.type || "image/webp" },
  });
  if (!res.ok) throw new Error(`upload to R2 failed (${res.status})`);
}

export async function uploadEntry(
  p: Prepared,
  lat: number,
  lng: number,
  source: "exif" | "manual",
): Promise<"created" | "duplicate"> {
  const takenAt = p.takenAt.toISOString();

  const signRes = await fetch("/api/admin/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ takenAt }),
  });
  if (!signRes.ok) {
    throw new Error(signRes.status === 401 ? "нужен вход в админку" : "не удалось получить ссылку");
  }
  const { photoKey, thumbKey, photoUploadUrl, thumbUploadUrl } = await signRes.json();

  await Promise.all([put(photoUploadUrl, p.photo), put(thumbUploadUrl, p.thumb)]);

  const res = await fetch("/api/admin/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ takenAt, lat, lng, source, photoKey, thumbKey }),
  });
  if (!res.ok) throw new Error("не удалось сохранить запись");

  const body = await res.json();
  return body.duplicate ? "duplicate" : "created";
}
