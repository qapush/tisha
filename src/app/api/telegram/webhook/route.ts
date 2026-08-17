import { db, type Entry } from "@/lib/db";
import { putObject } from "@/lib/r2";
import { prepareServer } from "@/lib/imageServer";
import { downloadFile, sendMessage, type TelegramUpdate } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * Lets you upload by sending a photo *as a file* to the bot in Telegram,
 * instead of through the browser's file picker. On Android 10+, a browser
 * reading a photo via the system picker only ever gets a location-redacted
 * copy (Scoped Storage's ACCESS_MEDIA_LOCATION restriction — no web API can
 * request the original). Telegram receiving a file you explicitly attached
 * as a document isn't going through that picker at all, so the GPS survives.
 *
 * "As a file/document" is the operative bit — sending it as a normal chat
 * photo has Telegram itself recompress and strip EXIF, same problem all
 * over again.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const message = update.message;
  if (!message) return Response.json({ ok: true });

  const chatId = message.chat.id;
  const allowed = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (!allowed || String(message.from?.id) !== allowed) {
    // Silently ignore anyone but the site's one admin — don't reveal the bot
    // even exists to a stranger who found its username.
    console.log("[telegram] ignoring message from unauthorized user", message.from?.id);
    return Response.json({ ok: true });
  }

  try {
    if (message.photo) {
      await sendMessage(
        chatId,
        "Это пришло как «Фото» — Telegram уже сжал его и стёр GPS. Пришли тем же файлом, но через скрепку → «Файл»/«Документ».",
      );
      return Response.json({ ok: true });
    }

    if (!message.document) return Response.json({ ok: true });

    const { file_id, file_name, mime_type } = message.document;
    if (mime_type && !/^image\//.test(mime_type)) {
      await sendMessage(chatId, "Это не похоже на фото — пропустил.");
      return Response.json({ ok: true });
    }

    const bytes = Buffer.from(await downloadFile(file_id));

    let prepared;
    try {
      prepared = await prepareServer(bytes, {
        mimeType: mime_type,
        fileName: file_name,
        fallbackDate: new Date(message.date * 1000),
      });
    } catch (err) {
      console.error("[telegram] prepareServer failed", err);
      await sendMessage(chatId, "Не смог обработать файл (формат не поддерживается ботом) — попробуй через сайт.");
      return Response.json({ ok: true });
    }

    if (prepared.lat === null || prepared.lng === null) {
      await sendMessage(chatId, "В фото нет GPS-координат — такое можно добавить только через сайт (ставится точка вручную).");
      return Response.json({ ok: true });
    }

    const d = prepared.takenAt;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const id = crypto.randomUUID();
    const photoKey = `photos/${yyyy}/${mm}/${id}.webp`;
    const thumbKey = `thumbs/${yyyy}/${mm}/${id}.webp`;

    await Promise.all([
      putObject(photoKey, prepared.photo, "image/webp"),
      putObject(thumbKey, prepared.thumb, "image/webp"),
    ]);

    const sql = db();
    const rows = (await sql`
      insert into entries (taken_at, lat, lng, source, photo_key, thumb_key)
      values (${d.toISOString()}, ${prepared.lat}, ${prepared.lng}, 'exif', ${photoKey}, ${thumbKey})
      on conflict do nothing
      returning id
    `) as Pick<Entry, "id">[];

    if (rows.length === 0) {
      await sendMessage(chatId, "Такая запись уже есть — пропустил.");
    } else {
      await sendMessage(chatId, `Добавлено ✅ (${d.toLocaleString("ru-RU")})`);
    }
  } catch (err) {
    console.error("[telegram] webhook failed", err);
    try {
      await sendMessage(chatId, "Что-то сломалось при обработке — гляну логи.");
    } catch {
      // best effort
    }
  }

  return Response.json({ ok: true });
}
