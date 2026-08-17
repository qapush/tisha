import { AwsClient } from "aws4fetch";

let _client: AwsClient | null = null;

function client(): AwsClient {
  if (!_client) {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not set");
    }
    _client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: "s3",
      region: "auto",
    });
  }
  return _client;
}

function objectUrl(key: string): string {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !bucket) {
    throw new Error("R2_ACCOUNT_ID / R2_BUCKET are not set");
  }
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${path}`;
}

/** Presigned PUT so the browser uploads straight to R2 — the file never touches our function. */
export async function signPutUrl(key: string, expiresIn = 600): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await client().sign(url.toString(), {
    method: "PUT",
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * URL the browser uses to display a photo.
 *
 * If you attach a custom domain to the bucket and set R2_PUBLIC_BASE_URL, we hand
 * out a plain cacheable URL. Otherwise the bucket stays private and we mint a
 * short-lived presigned GET.
 */
export async function photoUrl(key: string, expiresIn = 3600): Promise<string> {
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  if (publicBase) {
    const path = key.split("/").map(encodeURIComponent).join("/");
    return `${publicBase.replace(/\/$/, "")}/${path}`;
  }
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await client().sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * Direct server-side PUT — used where the server already has the bytes in
 * hand (e.g. the Telegram bot pipeline).
 *
 * Deliberately NOT `client().fetch()`: aws4fetch signs by building a
 * `Request` object and then calling `fetch(thatRequest)` — re-fetching an
 * already-constructed Request loses the body's known length in this
 * runtime, and R2 rejects the resulting request with 411/MissingContentLength
 * no matter whether the body was a Buffer or a Blob. Reusing the presigned
 * URL for a single direct `fetch(url, init)` call sidesteps that: it's the
 * exact same shape as the browser's upload (see lib/upload.ts), which has
 * always worked fine.
 */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const url = await signPutUrl(key);
  const res = await fetch(url, {
    method: "PUT",
    body: body as unknown as BodyInit,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) throw new Error(`R2 put failed for ${key}: ${res.status} ${await res.text().catch(() => "")}`);
}

export async function deleteObject(key: string): Promise<void> {
  const res = await client().fetch(objectUrl(key), { method: "DELETE" });
  // R2 returns 204 for a successful delete and 404 if it was already gone.
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed for ${key}: ${res.status}`);
  }
}
