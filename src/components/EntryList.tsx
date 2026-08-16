"use client";

import type { Entry } from "@/lib/types";

type Props = {
  entries: Entry[];
  isAdmin: boolean;
  onFocus: (id: string) => void;
  onDelete: (id: string) => void;
};

const dayFmt = new Intl.DateTimeFormat("ru-RU", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

export default function EntryList({ entries, isAdmin, onFocus, onDelete }: Props) {
  if (entries.length === 0) {
    return (
      <p className="empty">
        Пока пусто. {isAdmin ? "Закинь первое фото выше." : "Записей ещё нет."}
      </p>
    );
  }

  // Group by calendar day so the list reads like a diary rather than a dump.
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = new Date(e.takenAt).toDateString();
    const bucket = groups.get(key);
    if (bucket) bucket.push(e);
    else groups.set(key, [e]);
  }

  return (
    <div className="list">
      {[...groups.entries()].map(([day, items]) => (
        <section key={day} className="day">
          <h3 className="day-title">
            {dayFmt.format(new Date(day))}
            <span className="day-count">{items.length}</span>
          </h3>
          <ul>
            {items.map((e) => (
              <li key={e.id} className="row">
                <button className="row-main" onClick={() => onFocus(e.id)}>
                  {e.thumbUrl ? (
                    <img src={e.thumbUrl} alt="" className="row-thumb" loading="lazy" />
                  ) : (
                    <span className="row-thumb row-thumb--empty">💩</span>
                  )}
                  <span className="row-text">
                    <span className="row-time">{timeFmt.format(new Date(e.takenAt))}</span>
                    <span className="row-coords">
                      {e.lat.toFixed(5)}, {e.lng.toFixed(5)}
                      {e.source === "manual" && <span className="tag">вручную</span>}
                    </span>
                  </span>
                </button>
                {isAdmin && (
                  <button
                    className="row-del"
                    title="Удалить"
                    onClick={() => {
                      if (confirm("Удалить эту запись?")) onDelete(e.id);
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
