import { requireAdmin } from "@/lib/auth";
import { signPutUrl } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * Hands the browser two presigned PUT URLs (full-size + thumbnail) so the
 * upload goes straight to R2. Keeps the 4.5 MB Vercel request body limit and
 * the function's execution time out of the picture entirely.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let takenAt: string | undefined;
  try {
    ({ takenAt } = await req.json());
    if (!takenAt || Number.isNaN(Date.parse(takenAt))) throw new Error("bad takenAt");
  } catch {
    console.log("[POST /api/admin/upload-url] Invalid takenAt:", { takenAt });
    return Response.json({ error: "takenAt (ISO date) required" }, { status: 400 });
  }

  const d = new Date(takenAt);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const id = crypto.randomUUID();

  // Foldered by month so the bucket stays browsable, random id so a public
  // URL can't be guessed by walking dates.
  const photoKey = `photos/${yyyy}/${mm}/${id}.webp`;
  const thumbKey = `thumbs/${yyyy}/${mm}/${id}.webp`;

  console.log("[POST /api/admin/upload-url] Generating signed URLs:", {
    takenAt,
    photoKey,
    thumbKey,
    uploadId: id,
  });

  try {
    const [photoUploadUrl, thumbUploadUrl] = await Promise.all([
      signPutUrl(photoKey),
      signPutUrl(thumbKey),
    ]);
    console.log("[POST /api/admin/upload-url] Successfully generated upload URLs");
    return Response.json({ photoKey, thumbKey, photoUploadUrl, thumbUploadUrl });
  } catch (err) {
    console.error("[POST /api/admin/upload-url] Presign failed:", { error: err, takenAt });
    return Response.json({ error: "could not sign upload" }, { status: 500 });
  }
}
