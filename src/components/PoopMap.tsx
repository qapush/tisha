"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "@/lib/types";

type Props = {
  entries: Entry[];
  isAdmin: boolean;
  focusId: string | null;
  /** When true the map is in "drop a pin" mode for a photo with no GPS. */
  placing: boolean;
  onDelete: (id: string) => void;
  onPick: (lat: number, lng: number) => void;
};

const DEFAULT_CENTER: [number, number] = [52.2297, 21.0122]; // Warsaw

export default function PoopMap({
  entries,
  isAdmin,
  focusId,
  placing,
  onDelete,
  onPick,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const didFitRef = useRef(false);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const placingRef = useRef(placing);
  placingRef.current = placing;

  // Oldest-first — the slider below scrubs through this order by count.
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime()),
    [entries],
  );
  const [visibleCount, setVisibleCount] = useState(0);
  // Default stays pinned to "show everything" until the user actually drags
  // the slider — after that, clamp instead of yanking it back to max.
  const userMovedSliderRef = useRef(false);
  useEffect(() => {
    setVisibleCount((c) =>
      userMovedSliderRef.current
        ? Math.min(Math.max(c, 1), Math.max(sortedEntries.length, 1))
        : sortedEntries.length,
    );
  }, [sortedEntries.length]);
  // Clamp inline too — entries can change between a render and the effect
  // above catching up (e.g. a delete), so visibleCount may briefly be stale.
  const clampedVisibleCount = Math.min(
    Math.max(visibleCount, sortedEntries.length > 0 ? 1 : 0),
    sortedEntries.length,
  );
  const visibleEntries = sortedEntries.slice(0, clampedVisibleCount);

  // Leaflet touches `window` at import time, so it can only load in the browser.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !hostRef.current || mapRef.current) return;

      leafletRef.current = L;
      const map = L.map(hostRef.current, {
        center: DEFAULT_CENTER,
        zoom: 13,
        preferCanvas: true,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // Read the flag through a ref so the handler is registered once and still
      // sees the current mode.
      map.on("click", (ev: import("leaflet").LeafletMouseEvent) => {
        if (placingRef.current) onPickRef.current(ev.latlng.lat, ev.latlng.lng);
      });

      mapRef.current = map;
      // Force a redraw once the container has its real height.
      setTimeout(() => map.invalidateSize(), 0);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Rebuild markers whenever the data changes.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    markersRef.current.forEach((marker) => map.removeLayer(marker));
    markersRef.current.clear();

    const icon = L.divIcon({
      html: '<span class="poop-pin">💩</span>',
      className: "poop-pin-wrap",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14],
    });

    for (const e of visibleEntries) {
      const marker = L.marker([e.lat, e.lng], { icon });
      marker.bindPopup(() => popupHtml(e, isAdmin), { minWidth: 200 });
      marker.on("popupopen", (ev) => {
        const btn = ev.popup.getElement()?.querySelector<HTMLButtonElement>("[data-del]");
        btn?.addEventListener("click", () => {
          if (confirm("Удалить эту запись?")) onDeleteRef.current(e.id);
        });
      });
      marker.addTo(map);
      markersRef.current.set(e.id, marker);
    }

    // Fit to the data once, on first load — after that leave the view alone so
    // adding a photo doesn't yank the map out from under you.
    if (!didFitRef.current && entries.length > 0) {
      didFitRef.current = true;
      map.fitBounds(L.latLngBounds(entries.map((e) => [e.lat, e.lng] as [number, number])), {
        padding: [40, 40],
        maxZoom: 17,
      });
    }
  }, [visibleEntries, entries, isAdmin]);

  // Clicking a row in the list flies the map to that marker.
  useEffect(() => {
    if (!focusId) return;
    const map = mapRef.current;
    const marker = markersRef.current.get(focusId);
    if (!map || !marker) return;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 17), { duration: 0.6 });
    marker.openPopup();
  }, [focusId]);

  // Leaflet's own size cache goes stale the moment the container jumps in
  // and out of the fullscreen layout, so nudge it after the transition.
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement === wrapRef.current;
      setIsFullscreen(fs);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    setTimeout(() => mapRef.current?.invalidateSize(), 50);
  }, [isFullscreen]);

  // iPhone Safari never implemented the Fullscreen API for plain elements
  // (only iPadOS did), so requestFullscreen() there is a silent no-op. Fall
  // back to a CSS-only "fake fullscreen" and lock body scroll ourselves —
  // real fullscreen already suppresses that for us.
  useEffect(() => {
    if (!isFullscreen || document.fullscreenElement) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenEnabled) {
      setIsFullscreen((v) => !v);
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapRef.current?.requestFullscreen();
    }
  };

  return (
    <div ref={wrapRef} className={`map-wrap${isFullscreen ? " map-wrap--fullscreen" : ""}`}>
      <div ref={hostRef} className={`map-host${placing ? " map-host--placing" : ""}`} />
      <button
        type="button"
        className="map-fullscreen-btn"
        onClick={toggleFullscreen}
        title={isFullscreen ? "Свернуть карту" : "Развернуть карту"}
        aria-label={isFullscreen ? "Свернуть карту" : "Развернуть карту"}
      >
        {isFullscreen ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 3v4a2 2 0 0 1-2 2H3M15 3v4a2 2 0 0 0 2 2h4M9 21v-4a2 2 0 0 0-2-2H3M15 21v-4a2 2 0 0 1 2-2h4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        )}
      </button>

      {sortedEntries.length > 1 && (
        <div className="map-date-slider">
          <input
            type="range"
            className="map-date-slider-input"
            min={1}
            max={sortedEntries.length}
            step={1}
            value={clampedVisibleCount}
            onChange={(ev) => {
              userMovedSliderRef.current = true;
              setVisibleCount(Number(ev.target.value));
            }}
            aria-label="Срез по дате"
          />
          <div className="map-date-slider-label">
            {shortDate(sortedEntries[clampedVisibleCount - 1].takenAt)} · {clampedVisibleCount}/{sortedEntries.length}
          </div>
        </div>
      )}
    </div>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

function popupHtml(e: Entry, isAdmin: boolean): string {
  const when = new Date(e.takenAt).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

  return `
    <div class="popup">
      ${e.photoUrl ? `<a href="${esc(e.photoUrl)}" target="_blank" rel="noreferrer"><img src="${esc(e.thumbUrl ?? e.photoUrl)}" alt="" /></a>` : ""}
      <div class="popup-when">${esc(when)}</div>
      <div class="popup-meta">
        ${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}
        ${e.source === "manual" ? ' · <span title="Пин поставлен вручную">вручную</span>' : ""}
      </div>
      ${e.note ? `<div class="popup-note">${esc(e.note)}</div>` : ""}
      ${isAdmin ? '<button data-del class="popup-del">Удалить</button>' : ""}
    </div>`;
}
