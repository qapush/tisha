"use client";

import { useState } from "react";

export default function LoginBar({
  isAdmin,
  onChange,
}: {
  isAdmin: boolean;
  onChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isAdmin) {
    return (
      <button
        className="link login-link"
        onClick={async () => {
          await fetch("/api/admin/login", { method: "DELETE" });
          onChange(false);
        }}
      >
        выйти
      </button>
    );
  }

  if (!open) {
    return (
      <button className="link login-link" onClick={() => setOpen(true)}>
        вход
      </button>
    );
  }

  return (
    <form
      className="login-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        setBusy(false);
        if (res.ok) {
          setOpen(false);
          setPassword("");
          onChange(true);
        } else {
          setError("Неверный пароль");
        }
      }}
    >
      <input
        type="password"
        value={password}
        autoFocus
        placeholder="пароль"
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="btn" type="submit" disabled={busy}>
        ок
      </button>
      <button className="link" type="button" onClick={() => setOpen(false)}>
        отмена
      </button>
      {error && <span className="err">{error}</span>}
    </form>
  );
}
