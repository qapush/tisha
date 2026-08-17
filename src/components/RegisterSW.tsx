"use client";

import { useEffect } from "react";

/** Needed for installability (Add to Home Screen) and, in turn, share_target. */
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("SW registration failed", err);
      });
    }
  }, []);
  return null;
}
