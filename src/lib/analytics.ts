// Thin wrapper around window.umami — a no-op when the script hasn't loaded
// (ad blockers, NEXT_PUBLIC_UMAMI_WEBSITE_ID unset, etc.) so call sites never
// need to guard for it themselves.
declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}

export function track(event: string, data?: Record<string, unknown>) {
  window.umami?.track(event, data);
}
