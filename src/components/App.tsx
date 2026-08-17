"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import EntryList from "./EntryList";
import UploadPanel from "./UploadPanel";
import LoginBar from "./LoginBar";
import type { Entry, Pending } from "@/lib/types";
import { uploadEntry } from "@/lib/upload";
import { sameSpot } from "@/lib/dedupe";

// Leaflet has no SSR story at all — keep it out of the server bundle.
const PoopMap = dynamic(() => import("./PoopMap"), {
  ssr: false,
  loading: () => <div className="map-host map-host--loading">карта загружается…</div>,
});

export default function App({ initialIsAdmin }: { initialIsAdmin: boolean }) {
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const objectUrls = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/entries", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const { entries } = await res.json();
      setEntries(entries);
      setLoadError(null);
    } catch {
      setLoadError("Не удалось загрузить записи. Обнови страницу.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Release the preview blobs when the component goes away.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // A promise rejecting outside any try/catch (e.g. inside a callback React
  // itself doesn't await) otherwise fails completely silently — the UI just
  // sits there stuck. Surface it instead of leaving "nothing happens".
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      console.error("unhandled rejection", e.reason);
      setBusy(false);
      alert(`Что-то сломалось: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    setBusy(true);
    try {
      const { prepare } = await import("@/lib/image");
      for (const file of files) {
        try {
          // Some HEIC conversions/decodes can hang instead of rejecting (seen
          // with certain browser/codec combos) — without this the button just
          // stays stuck forever with zero feedback.
          const prepared = await Promise.race([
            prepare(file),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`обработка "${file.name}" зависла (>20с)`)),
                20_000,
              ),
            ),
          ]);
          objectUrls.current.add(prepared.previewUrl);
          setPending((prev) => {
            const candidate = { takenAt: prepared.takenAt, lat: prepared.lat, lng: prepared.lng };
            const isDuplicate =
              entries.some((e) => sameSpot(candidate, e)) ||
              prev.some((p) => p.status !== "error" && sameSpot(candidate, p));
            return [
              ...prev,
              {
                // crypto.randomUUID() needs a secure context — unavailable when
                // testing from a phone over plain http://<lan-ip>, so don't rely on it.
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                prepared,
                previewUrl: prepared.previewUrl,
                takenAt: prepared.takenAt,
                lat: prepared.lat,
                lng: prepared.lng,
                source: "exif",
                status: isDuplicate ? "duplicate" : "ready",
              },
            ];
          });
        } catch (err) {
          console.error("prepare failed", file.name, err);
          alert(`Не смог прочитать ${file.name}. Формат не поддерживается?`);
        }
      }
    } finally {
      setBusy(false);
    }
  }, [entries]);

  const handlePick = useCallback(
    (lat: number, lng: number) => {
      if (!placingId) return;
      setPending((prev) => {
        const placed = prev.find((p) => p.id === placingId);
        if (!placed) return prev;
        const candidate = { takenAt: placed.takenAt, lat, lng };
        const isDuplicate =
          entries.some((e) => sameSpot(candidate, e)) ||
          prev.some((p) => p.id !== placingId && p.status !== "error" && sameSpot(candidate, p));
        return prev.map((p) =>
          p.id === placingId
            ? { ...p, lat, lng, source: "manual", status: isDuplicate ? "duplicate" : "ready" }
            : p,
        );
      });
      setPlacingId(null);
    },
    [placingId, entries],
  );

  const handleSaveAll = useCallback(async () => {
    setBusy(true);
    let saved = 0;
    let dupes = 0;

    for (const p of pending) {
      if (p.lat === null || p.lng === null || p.status !== "ready") continue;
      setPending((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: "uploading" } : x)));
      try {
        const result = await uploadEntry(p.prepared, p.lat, p.lng, p.source);
        if (result === "duplicate") dupes++;
        else saved++;
        URL.revokeObjectURL(p.previewUrl);
        objectUrls.current.delete(p.previewUrl);
        setPending((prev) => prev.filter((x) => x.id !== p.id));
      } catch (err) {
        setPending((prev) =>
          prev.map((x) =>
            x.id === p.id
              ? { ...x, status: "error", error: err instanceof Error ? err.message : "ошибка" }
              : x,
          ),
        );
      }
    }

    setBusy(false);
    if (saved > 0) await refresh();
    if (dupes > 0) alert(`${dupes} фото пропущено — такие записи уже есть.`);
  }, [pending, refresh]);

  const handleDelete = useCallback(async (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    const res = await fetch(`/api/admin/entries?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("Не удалось удалить.");
      await refresh();
    }
  }, [refresh]);

  const handleDrop = useCallback((id: string) => {
    setPending((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) {
        URL.revokeObjectURL(item.previewUrl);
        objectUrls.current.delete(item.previewUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
    setPlacingId((cur) => (cur === id ? null : cur));
  }, []);

  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const times = entries.map((e) => new Date(e.takenAt).getTime());
    const spanDays = Math.max(1, (Math.max(...times) - Math.min(...times)) / 86_400_000);
    return {
      total: entries.length,
      perDay: (entries.length / spanDays).toFixed(1),
      days: Math.round(spanDays),
    };
  }, [entries]);

  return (
    <div className="app">
      <header className="header">
        <h1>
          <span aria-hidden>💩</span> Карта Тиши
        </h1>
        {stats && (
          <p className="stats">
            {stats.total} записей за {stats.days} дн. · ~{stats.perDay} в день
          </p>
        )}
        <LoginBar isAdmin={isAdmin} onChange={setIsAdmin} />
      </header>

      {isAdmin && (
        <UploadPanel
          pending={pending}
          busy={busy}
          placingId={placingId}
          onFiles={handleFiles}
          onStartPlacing={setPlacingId}
          onDrop={handleDrop}
          onSaveAll={handleSaveAll}
        />
      )}

      {placingId && (
        <div className="banner">
          Кликни на карте, где это произошло.{" "}
          <button className="link" onClick={() => setPlacingId(null)}>
            отмена
          </button>
        </div>
      )}

      {loadError && <p className="banner banner--err">{loadError}</p>}

      <PoopMap
        entries={entries}
        isAdmin={isAdmin}
        focusId={focusId}
        placing={placingId !== null}
        onDelete={handleDelete}
        onPick={handlePick}
      />

      {loading ? (
        <p className="empty">Загружаю…</p>
      ) : (
        <EntryList
          entries={entries}
          isAdmin={isAdmin}
          onFocus={setFocusId}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
