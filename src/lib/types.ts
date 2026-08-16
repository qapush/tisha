import type { Prepared } from "./image";

export type Entry = {
  id: string;
  takenAt: string;
  lat: number;
  lng: number;
  source: "exif" | "manual";
  note: string | null;
  thumbUrl: string | null;
  photoUrl: string | null;
};

/** A photo that has been read and downscaled in the browser but not saved yet. */
export type Pending = {
  id: string;
  prepared: Prepared;
  previewUrl: string;
  takenAt: Date;
  lat: number | null;
  lng: number | null;
  source: "exif" | "manual";
  status: "ready" | "uploading" | "error";
  error?: string;
};
