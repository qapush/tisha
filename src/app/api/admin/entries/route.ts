import { requireAdmin } from "@/lib/auth";
import { db, type Entry } from "@/lib/db";
import { deleteObject } from "@/lib/r2";

export const dynamic = "force-dynamic";

type Body = {
  takenAt?: string;
  lat?: number;
  lng?: number;
  source?: "exif" | "manual";
  photoKey?: string | null;
  thumbKey?: string | null;
  note?: string | null;
};

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let b: Body;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  console.log("[POST /api/admin/entries] Incoming request:", {
    takenAt: b.takenAt,
    lat: b.lat,
    lng: b.lng,
    source: b.source,
    photoKey: b.photoKey,
    thumbKey: b.thumbKey,
  });

  const { takenAt, lat, lng } = b;
  if (!takenAt || Number.isNaN(Date.parse(takenAt))) {
    console.log("[POST /api/admin/entries] Validation failed: bad takenAt", { takenAt });
    return Response.json({ error: "takenAt must be an ISO date" }, { status: 400 });
  }
  if (typeof lat !== "number" || lat < -90 || lat > 90) {
    console.log("[POST /api/admin/entries] Validation failed: lat out of range", { lat });
    return Response.json({ error: "lat out of range" }, { status: 400 });
  }
  if (typeof lng !== "number" || lng < -180 || lng > 180) {
    console.log("[POST /api/admin/entries] Validation failed: lng out of range", { lng });
    return Response.json({ error: "lng out of range" }, { status: 400 });
  }

  const source = b.source === "manual" ? "manual" : "exif";

  try {
    const sql = db();
    console.log("[POST /api/admin/entries] Inserting into DB:", {
      takenAt,
      lat,
      lng,
      source,
      photoKey: b.photoKey,
      thumbKey: b.thumbKey,
    });

    const rows = (await sql`
      insert into entries (taken_at, lat, lng, source, photo_key, thumb_key, note)
      values (${takenAt}, ${lat}, ${lng}, ${source}, ${b.photoKey ?? null},
              ${b.thumbKey ?? null}, ${b.note ?? null})
      on conflict do nothing
      returning id, taken_at, lat, lng, source, photo_key, thumb_key, note, created_at
    `) as Entry[];

    // The dedupe index swallowed it — same second, same spot.
    if (rows.length === 0) {
      console.log("[POST /api/admin/entries] Duplicate detected (on conflict):", { takenAt, lat, lng });
      return Response.json({ duplicate: true }, { status: 200 });
    }
    console.log("[POST /api/admin/entries] Created entry:", { id: rows[0].id, takenAt: rows[0].taken_at });
    return Response.json({ entry: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/admin/entries] Insert failed:", { error: err, takenAt, lat, lng });
    return Response.json({ error: "insert failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  try {
    const sql = db();
    const rows = (await sql`
      delete from entries where id = ${id}
      returning photo_key, thumb_key
    `) as Pick<Entry, "photo_key" | "thumb_key">[];

    if (rows.length === 0) return Response.json({ error: "not found" }, { status: 404 });

    // Best effort — a leftover object in R2 is cheaper than a failed delete.
    await Promise.allSettled(
      [rows[0].photo_key, rows[0].thumb_key]
        .filter((k): k is string => Boolean(k))
        .map((k) => deleteObject(k)),
    );

    return Response.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/entries failed", err);
    return Response.json({ error: "delete failed" }, { status: 500 });
  }
}

/** Move a pin that landed in the wrong place. */
export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let id: string, lat: number, lng: number;
  try {
    ({ id, lat, lng } = await req.json());
    if (!id || typeof lat !== "number" || typeof lng !== "number") throw new Error();
  } catch {
    return Response.json({ error: "id, lat, lng required" }, { status: 400 });
  }

  try {
    const sql = db();
    await sql`update entries set lat = ${lat}, lng = ${lng}, source = 'manual' where id = ${id}`;
    return Response.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/admin/entries failed", err);
    return Response.json({ error: "update failed" }, { status: 500 });
  }
}
