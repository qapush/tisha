import exifr from "exifr";

export const FULL_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 400;

export type Prepared = {
  name: string;
  takenAt: Date;
  /** null when the photo carried no GPS — the UI then asks you to place the pin. */
  lat: number | null;
  lng: number | null;
  photo: Blob;
  thumb: Blob;
  /** object URL of the thumb, for the preview strip. Revoke when done. */
  previewUrl: string;
};

async function looksLikeHeic(file: File): Promise<boolean> {
  if (/^image\/hei[cf]/i.test(file.type)) return true;
  if (/\.(heic|heif)$/i.test(file.name)) return true;
  // iOS sometimes hands over a HEIC with an empty MIME type and a .jpg name,
  // so fall back to sniffing the ISO-BMFF brand in the file header.
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const brand = String.fromCharCode(...head.slice(8, 12));
    return ["heic", "heix", "hevc", "heim", "heis", "hevm", "mif1", "msf1"].includes(brand);
  } catch {
    return false;
  }
}

async function decode(file: File): Promise<ImageBitmap> {
  let source: Blob = file;

  if (await looksLikeHeic(file)) {
    // Dynamic import: libheif is ~1.5 MB of wasm, no reason to ship it to
    // visitors who are only looking at the map.
    const { heicTo } = await import("heic-to");
    source = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
  }

  // 'from-image' applies the EXIF orientation flag, otherwise portrait photos
  // from the phone come out sideways.
  return createImageBitmap(source, { imageOrientation: "from-image" });
}

async function encode(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (blob) return blob;

  // Very old Safari can't encode WebP — fall back to JPEG.
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!jpeg) throw new Error("could not encode image");
  return jpeg;
}

/**
 * Reads metadata from the ORIGINAL file (never from the re-encoded copy — the
 * canvas drops all EXIF), then produces a downscaled photo and a thumbnail.
 */
export async function prepare(file: File): Promise<Prepared> {
  // exifr parses HEIC directly, so this runs before any conversion.
  const meta = await exifr.parse(file, { tiff: true, exif: true, gps: true }).catch(() => null);

  const lat = typeof meta?.latitude === "number" && Number.isFinite(meta.latitude) ? meta.latitude : null;
  const lng = typeof meta?.longitude === "number" && Number.isFinite(meta.longitude) ? meta.longitude : null;

  const takenAt: Date =
    meta?.DateTimeOriginal instanceof Date
      ? meta.DateTimeOriginal
      : meta?.CreateDate instanceof Date
        ? meta.CreateDate
        : new Date(file.lastModified);

  const bitmap = await decode(file);
  try {
    const [photo, thumb] = await Promise.all([
      encode(bitmap, FULL_MAX_SIDE, 0.82),
      encode(bitmap, THUMB_MAX_SIDE, 0.7),
    ]);
    return {
      name: file.name,
      takenAt,
      lat: lat !== null && lng !== null ? lat : null,
      lng: lat !== null && lng !== null ? lng : null,
      photo,
      thumb,
      previewUrl: URL.createObjectURL(thumb),
    };
  } finally {
    bitmap.close();
  }
}
