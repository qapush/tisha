"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import EntryList from "./EntryList";
import UploadPanel from "./UploadPanel";
import LoginBar from "./LoginBar";
import type { Entry, Pending } from "@/lib/types";
import { uploadEntry } from "@/lib/upload";

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

  const handleFiles = useCallback(async (files: FileList) => {
    setBusy(true);
    const { prepare } = await import("@/lib/image");
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      try {
        const prepared = await prepare(file);
        objectUrls.current.add(prepared.previewUrl);
        setPending((prev) => [
          ...prev,
          {
            id,
            prepared,
            previewUrl: prepared.previewUrl,
            takenAt: prepared.takenAt,
            lat: prepared.lat,
            lng: prepared.lng,
            source: "exif",
            status: "ready",
          },
        ]);
      } catch (err) {
        console.error("prepare failed", file.name, err);
        alert(`Не смог прочитать ${file.name}. Формат не поддерживается?`);
      }
    }
    setBusy(false);
  }, []);

  const handlePick = useCallback(
    (lat: number, lng: number) => {
      if (!placingId) return;
      setPending((prev) =>
        prev.map((p) => (p.id === placingId ? { ...p, lat, lng, source: "manual" } : p)),
      );
      setPlacingId(null);
    },
    [placingId],
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
