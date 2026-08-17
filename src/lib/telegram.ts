function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

type TelegramFile = { file_id: string; file_path?: string; file_size?: number };

/** Bot API's two-step file fetch: resolve a file_id to a path, then download it. */
export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const infoRes = await fetch(`https://api.telegram.org/bot${token()}/getFile?file_id=${fileId}`);
  const info = (await infoRes.json()) as { ok: boolean; result?: TelegramFile; description?: string };
  if (!info.ok || !info.result?.file_path) {
    throw new Error(`getFile failed: ${info.description ?? "no file_path"}`);
  }

  const fileRes = await fetch(`https://api.telegram.org/file/bot${token()}/${info.result.file_path}`);
  if (!fileRes.ok) throw new Error(`file download failed: ${fileRes.status}`);
  return fileRes.arrayBuffer();
}

export async function sendMessage(chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export type TelegramUpdate = {
  message?: {
    message_id: number;
    date: number;
    from?: { id: number };
    chat: { id: number };
    document?: { file_id: string; file_name?: string; mime_type?: string };
    photo?: { file_id: string }[];
  };
};
