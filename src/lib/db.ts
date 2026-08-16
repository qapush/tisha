import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

/**
 * Neon's HTTP driver — one fetch per query, no connection pool to manage.
 * That is what makes it safe on Vercel's serverless functions, and it is also
 * why a scaled-to-zero compute just wakes up on the next query.
 *
 * Lazily created so that `next build` does not need DATABASE_URL.
 */
export function db(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = neon(url);
  }
  return _sql;
}

export type Entry = {
  id: string;
  taken_at: string;
  lat: number;
  lng: number;
  source: "exif" | "manual";
  photo_key: string | null;
  thumb_key: string | null;
  note: string | null;
  created_at: string;
};
