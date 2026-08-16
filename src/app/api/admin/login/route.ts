import { cookies } from "next/headers";
import { ADMIN_COOKIE, checkPassword, makeToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let password = "";
  try {
    ({ password = "" } = await req.json());
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  if (!password || !checkPassword(password)) {
    // Small delay so the endpoint is not a fast password oracle.
    await new Promise((r) => setTimeout(r, 400));
    return Response.json({ error: "wrong password" }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, await makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return Response.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  return Response.json({ ok: true });
}
