import { db, type Entry } from "@/lib/db";
import { photoUrl } from "@/lib/r2";

export const dynamic = "force-dynamic";

/** Public: everything needed to draw the map and the list. */
export async function GET() {
  try {
    const sql = db();
    const rows = (await sql`
      select id, taken_at, lat, lng, source, photo_key, thumb_key, note, created_at
      from entries
      order by taken_at desc
    `) as Entry[];

    const entries = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        takenAt: r.taken_at,
        lat: r.lat,
        lng: r.lng,
        source: r.source,
        note: r.note,
        thumbUrl: r.thumb_key ? await photoUrl(r.thumb_key) : null,
        photoUrl: r.photo_key ? await photoUrl(r.photo_key) : null,
      })),
    );

    return Response.json(
      { entries },
      // Presigned URLs live an hour; caching the payload for five minutes keeps
      // them comfortably fresh while sparing Neon a wake-up on every reload.
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    console.error("GET /api/entries failed", err);
    return Response.json({ error: "failed to load entries" }, { status: 500 });
  }
}
