-- Tisha poop map — schema
-- Run once against your Neon database (SQL Editor in the Neon console, or `npm run db:init`).

create extension if not exists "pgcrypto";

create table if not exists entries (
  id          uuid primary key default gen_random_uuid(),
  -- when the photo was taken (EXIF DateTimeOriginal), falling back to file mtime
  taken_at    timestamptz not null,
  lat         double precision not null,
  lng         double precision not null,
  -- 'exif'   = coordinates came from the photo's own metadata
  -- 'manual' = you dropped the pin by hand
  source      text not null default 'exif' check (source in ('exif', 'manual')),
  photo_key   text,
  thumb_key   text,
  note        text,
  created_at  timestamptz not null default now(),

  constraint entries_lat_range check (lat between -90 and 90),
  constraint entries_lng_range check (lng between -180 and 180)
);

create index if not exists entries_taken_at_idx on entries (taken_at desc);
create index if not exists entries_bbox_idx on entries (lat, lng);

-- Guards against uploading the same photo twice: two entries within ~1 metre
-- and the same second are almost certainly a duplicate import.
create unique index if not exists entries_dedupe_idx
  on entries (taken_at, round(lat::numeric, 5), round(lng::numeric, 5));
