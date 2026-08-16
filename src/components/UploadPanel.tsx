"use client";

import { useRef } from "react";
import type { Pending } from "@/lib/types";

type Props = {
  pending: Pending[];
  busy: boolean;
  placingId: string | null;
  onFiles: (files: FileList) => void;
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

  return (
    <div className="panel">
      <div className="panel-head">
        <button className="btn btn--primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          Выбрать фото
        </button>
        <input
          ref={inputRef}
          type="file"
          /* Deliberately NOT listing image/heic here: on Safari 17+ that makes
             iOS transcode files on the way in. Plain image/* keeps originals. */
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
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
          iPhone их не записал или они потерялись при передаче. Нажми «поставить на карте» и кликни
          нужное место.
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
