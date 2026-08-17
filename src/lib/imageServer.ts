import exifr from "exifr";
import sharp from "sharp";
import { extractHeicExifBuffer } from "./heicExif";

export const FULL_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 400;

export type PreparedServer = {
  takenAt: Date;
  lat: number | null;
  lng: number | null;
  photo: Buffer;
  thumb: Buffer;
};

function looksLikeHeic(buf: Buffer, mimeType?: string, fileName?: string): boolean {
  if (mimeType && /^image\/hei[cf]/i.test(mimeType)) return true;
  if (fileName && /\.(heic|heif)$/i.test(fileName)) return true;
  if (buf.length >= 12) {
    const brand = buf.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "heim", "heis", "hevm", "mif1", "msf1"].includes(brand)) return true;
  }
  return false;
}

/**
 * Server-side counterpart to lib/image.ts's prepare(), for the Telegram bot
 * pipeline where the file arrives as bytes on the server rather than a
 * browser File. Same rule as the client version: read EXIF from the
 * original bytes, never from the re-encoded copy.
 */
export async function prepareServer(
  buf: Buffer,
  opts: { mimeType?: string; fileName?: string; fallbackDate: Date },
): Promise<PreparedServer> {
  const isHeic = looksLikeHeic(buf, opts.mimeType, opts.fileName);

  let meta: Awaited<ReturnType<typeof exifr.parse>> = null;
  if (isHeic) {
    const exifBuf = extractHeicExifBuffer(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    );
    if (exifBuf) meta = await exifr.parse(exifBuf, { tiff: true, exif: true, gps: true }).catch(() => null);
  }
  if (!meta) {
    meta = await exifr.parse(buf, { tiff: true, exif: true, gps: true }).catch(() => null);
  }

  const lat = typeof meta?.latitude === "number" && Number.isFinite(meta.latitude) ? meta.latitude : null;
  const lng = typeof meta?.longitude === "number" && Number.isFinite(meta.longitude) ? meta.longitude : null;

  const takenAt: Date =
    meta?.DateTimeOriginal instanceof Date
      ? meta.DateTimeOriginal
      : meta?.CreateDate instanceof Date
        ? meta.CreateDate
        : opts.fallbackDate;

  // .rotate() with no args applies the EXIF orientation tag — matches
  // createImageBitmap's imageOrientation: "from-image" in the browser pipeline.
  const image = sharp(buf).rotate();

  const [photo, thumb] = await Promise.all([
    image
      .clone()
      .resize(FULL_MAX_SIDE, FULL_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(),
    image
      .clone()
      .resize(THUMB_MAX_SIDE, THUMB_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer(),
  ]);

  return {
    takenAt,
    lat: lat !== null && lng !== null ? lat : null,
    lng: lat !== null && lng !== null ? lng : null,
    photo,
    thumb,
  };
}
