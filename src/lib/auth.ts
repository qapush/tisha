import { cookies } from "next/headers";

export const ADMIN_COOKIE = "tisha_admin";

function secret(): string {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) throw new Error("ADMIN_PASSWORD is not set");
  return p;
}

/**
 * The cookie value is an HMAC of a fixed string keyed by ADMIN_PASSWORD, so the
 * password itself is never stored in the browser and rotating the env var
 * invalidates every existing session.
 */
export async function makeToken(): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("tisha-admin-v1"));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkPassword(input: string): boolean {
  return constantTimeEqual(input, secret());
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const got = jar.get(ADMIN_COOKIE)?.value;
  if (!got) return false;
  try {
    return constantTimeEqual(got, await makeToken());
  } catch {
    return false;
  }
}

/** Throws a Response-shaped error for API routes that must be admin-only. */
export async function requireAdmin(): Promise<Response | null> {
  if (await isAdmin()) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
