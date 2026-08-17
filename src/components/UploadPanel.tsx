"use client";

import { useEffect, useRef } from "react";
import type { Pending } from "@/lib/types";

type Props = {
  pending: Pending[];
  busy: boolean;
  placingId: string | null;
  onFiles: (files: File[]) => void;
  onStartPlacing: (id: string) => void;
  onDrop: (id: string) => void;
  onSaveAll: () => void;
};

const dtFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default function UploadPanel({
  pending,
  busy,
  placingId,
  onFiles,
  onStartPlacing,
  onDrop,
  onSaveAll,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = pending.filter((p) => p.lat !== null && p.status === "ready");
  const needPin = pending.filter((p) => p.lat === null && p.status === "ready");

  // React's synthetic onChange was confirmed (via manual addEventListener in
  // devtools) to NOT fire on this input, even though the native DOM 'change'
  // event does. Bind natively instead of trusting JSX onChange.
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      const input = e.target as HTMLInputElement;
      // Copy out of the FileList (which some browsers back with the input's
      // own live selection) BEFORE resetting .value below — otherwise, once
      // the async onFiles callback comes back from its first await, the reset
      // has already emptied the list out from under it.
      const picked = input.files ? Array.from(input.files) : [];
      input.value = "";
      if (picked.length) onFilesRef.current(picked);
    };
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, []);

  return (
    <div className="panel">
      <div className="panel-head">
        <button className="btn btn--primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Обрабатываю…" : "Выбрать фото"}
        </button>
        <input
          ref={inputRef}
          type="file"
          /* No accept filter at all — deliberately. Chrome on Android reads
             even an extension-only accept (".jpg" etc.) as "this is an image
             field" and routes it through the system Photo Picker, which
             strips GPS out of EXIF before handing the file over; only its
             plain document/file picker leaves the file untouched. Listing
             "image/heic" specifically has its own separate problem — it
             makes Safari 17+ transcode HEIC on the way in — so it's not an
             option either. No accept attribute is the one thing that reliably
             avoids both. */
          multiple
          hidden
        />
        {pending.length > 0 && (
          <button className="btn" onClick={onSaveAll} disabled={busy || ready.length === 0}>
            {busy ? "Загружаю…" : `Сохранить (${ready.length})`}
          </button>
        )}
      </div>

      {needPin.length > 0 && (
        <p className="hint hint--warn">
          У {needPin.length === 1 ? "одного фото" : `${needPin.length} фото`} нет координат в EXIF —
          устройство их не записало, или геометки потерялись при передаче (частая история для
          галереи/пикера на Android). Нажми «поставить на карте» и кликни нужное место.
        </p>
      )}

      {pending.length > 0 && (
        <ul className="pending">
          {pending.map((p) => (
            <li key={p.id} className={`pending-item pending-item--${p.status}`}>
              <img src={p.previewUrl} alt="" className="pending-thumb" />
              <div className="pending-body">
                <div className="pending-when">{dtFmt.format(p.takenAt)}</div>
                <div className="pending-meta">
                  {p.status === "error" ? (
                    <span className="err">{p.error}</span>
                  ) : p.lat !== null && p.lng !== null ? (
                    <>
                      {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                      {p.source === "manual" && <span className="tag">вручную</span>}
                      {p.status === "duplicate" && (
                        <span className="tag tag--dup">такое фото уже есть</span>
                      )}
                    </>
                  ) : placingId === p.id ? (
                    <span className="placing">кликни на карте…</span>
                  ) : (
                    <button className="link" onClick={() => onStartPlacing(p.id)}>
                      поставить на карте
                    </button>
                  )}
                </div>
              </div>
              <button className="row-del" title="Убрать" onClick={() => onDrop(p.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
