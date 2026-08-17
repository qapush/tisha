// Mirrors the DB's entries_dedupe_idx: same second, same spot to ~1m
// (round to 5 decimal places). Used to flag duplicates client-side before
// spending bandwidth uploading a photo that the server would just reject.
function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

export function sameSpot(
  a: { takenAt: Date; lat: number | null; lng: number | null },
  b: { takenAt: Date | string; lat: number | null; lng: number | null },
): boolean {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return false;
  const aSec = Math.floor(a.takenAt.getTime() / 1000);
  const bSec = Math.floor(new Date(b.takenAt).getTime() / 1000);
  return aSec === bSec && round5(a.lat) === round5(b.lat) && round5(a.lng) === round5(b.lng);
}
