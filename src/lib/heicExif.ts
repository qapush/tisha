/**
 * Minimal ISOBMFF/HEIF box walker, used for exactly one thing: locate the
 * "Exif" item inside a HEIC container and return its raw TIFF/EXIF bytes.
 *
 * Why this exists instead of just calling exifr on the whole file: exifr's
 * HEIC format sniffer rejects any file whose `ftyp` box is bigger than 50
 * bytes (hard-coded in the library, no newer release fixes it — 7.1.3 is
 * current as of writing). Modern iPhones write more compatible brands in
 * `ftyp` than that (HDR gain-map support adds "tmap"), which pushes the box
 * past 50 bytes and makes exifr throw "Unknown file format" — silently
 * losing GPS *and* the capture date for every photo. A raw TIFF/EXIF buffer,
 * on the other hand, is a format exifr recognizes without any HEIC-specific
 * sniffing, so extracting it ourselves and handing exifr just that sidesteps
 * the bug entirely.
 */

type Box = { type: string; bodyStart: number; end: number };

function ascii(view: DataView, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

function walkBoxes(view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let o = start;
  while (o + 8 <= end) {
    let size = view.getUint32(o);
    const type = ascii(view, o + 4, 4);
    let headerLen = 8;
    if (size === 1) {
      size = view.getUint32(o + 8) * 2 ** 32 + view.getUint32(o + 12);
      headerLen = 16;
    } else if (size === 0) {
      size = end - o;
    }
    boxes.push({ type, bodyStart: o + headerLen, end: o + size });
    o += size;
  }
  return boxes;
}

/** Reads a big-endian uint of 0, 2, 4, or 8 bytes — the odd widths ISOBMFF uses. */
function readSized(view: DataView, offset: number, byteLen: number): number {
  if (byteLen === 0) return 0;
  if (byteLen === 2) return view.getUint16(offset);
  if (byteLen === 4) return view.getUint32(offset);
  if (byteLen === 8) return view.getUint32(offset) * 2 ** 32 + view.getUint32(offset + 4);
  throw new Error(`unsupported iloc field size ${byteLen}`);
}

function findExifItemId(view: DataView, iinf: Box): number | null {
  // iinf is a FullBox: version(1) + flags(3), then item_count (2 or 4 bytes).
  const version = view.getUint8(iinf.bodyStart);
  let p = iinf.bodyStart + 4;
  let itemCount: number;
  if (version === 0) {
    itemCount = view.getUint16(p);
    p += 2;
  } else {
    itemCount = view.getUint32(p);
    p += 4;
  }

  for (let i = 0; i < itemCount && p < iinf.end; i++) {
    const [infe] = walkBoxes(view, p, iinf.end);
    if (!infe) break;
    // infe is a FullBox too; layout of the fixed fields depends on its version.
    const infeVersion = view.getUint32(infe.bodyStart) >>> 24;
    let q = infe.bodyStart + 4;
    if (infeVersion === 2) {
      const itemId = view.getUint16(q);
      const itemType = ascii(view, q + 4, 4);
      if (itemType === "Exif") return itemId;
    } else if (infeVersion >= 3) {
      const itemId = view.getUint32(q);
      const itemType = ascii(view, q + 6, 4);
      if (itemType === "Exif") return itemId;
    }
    p = infe.end;
  }
  return null;
}

function findItemExtent(
  view: DataView,
  iloc: Box,
  targetItemId: number,
): { start: number; length: number } | null {
  let p = iloc.bodyStart;
  const version = view.getUint32(p) >>> 24;
  p += 4;
  const sizes1 = view.getUint8(p);
  const sizes2 = view.getUint8(p + 1);
  const offsetSize = sizes1 >> 4;
  const lengthSize = sizes1 & 0xf;
  const baseOffsetSize = sizes2 >> 4;
  const indexSize = sizes2 & 0xf;
  p += 2;
  let itemCount: number;
  if (version < 2) {
    itemCount = view.getUint16(p);
    p += 2;
  } else {
    itemCount = view.getUint32(p);
    p += 4;
  }

  for (let i = 0; i < itemCount; i++) {
    let itemId: number;
    if (version < 2) {
      itemId = view.getUint16(p);
      p += 2;
    } else {
      itemId = view.getUint32(p);
      p += 4;
    }
    if (version === 1 || version === 2) p += 2; // construction_method
    p += 2; // data_reference_index
    const baseOffset = readSized(view, p, baseOffsetSize);
    p += baseOffsetSize;
    const extentCount = view.getUint16(p);
    p += 2;

    let firstExtent: { start: number; length: number } | null = null;
    for (let e = 0; e < extentCount; e++) {
      if (indexSize > 0) p += indexSize;
      const extOffset = readSized(view, p, offsetSize);
      p += offsetSize;
      const extLength = readSized(view, p, lengthSize);
      p += lengthSize;
      if (e === 0) firstExtent = { start: baseOffset + extOffset, length: extLength };
    }
    if (itemId === targetItemId && firstExtent) return firstExtent;
  }
  return null;
}

/** Returns the raw TIFF/EXIF bytes embedded in a HEIC file, or null if not found. */
export function extractHeicExifBuffer(buf: ArrayBuffer): Uint8Array | null {
  try {
    const view = new DataView(buf);
    const meta = walkBoxes(view, 0, buf.byteLength).find((b) => b.type === "meta");
    if (!meta) return null;
    // meta is itself a FullBox: version/flags before its nested boxes.
    const inner = walkBoxes(view, meta.bodyStart + 4, meta.end);
    const iinf = inner.find((b) => b.type === "iinf");
    const iloc = inner.find((b) => b.type === "iloc");
    if (!iinf || !iloc) return null;

    const exifItemId = findExifItemId(view, iinf);
    if (exifItemId === null) return null;
    const extent = findItemExtent(view, iloc, exifItemId);
    if (!extent) return null;

    // Per the HEIF spec, an "Exif" item's payload starts with a 4-byte
    // big-endian offset to skip before the actual TIFF header begins.
    const tiffHeaderOffset = view.getUint32(extent.start);
    const tiffStart = extent.start + 4 + tiffHeaderOffset;
    return new Uint8Array(buf, tiffStart, extent.start + extent.length - tiffStart);
  } catch {
    return null;
  }
}
