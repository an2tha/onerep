import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

export type DownloadOptions = {
  concurrency?: number;
  headers?: Record<string, string>;
  onProgress?: (downloaded: number, total?: number) => void;
};

const USER_AGENT = "OneRep-Datasource/1.0 (app.onerep.life)";

async function responseInfo(url: string, headers: Record<string, string>): Promise<{ length?: number; ranges: boolean }> {
  const response = await fetch(url, { method: "HEAD", headers, redirect: "follow" });
  if (!response.ok) throw new Error(`Download probe failed (${response.status}) for ${url}`);
  const length = Number(response.headers.get("content-length"));
  return { length: Number.isSafeInteger(length) && length > 0 ? length : undefined, ranges: response.headers.get("accept-ranges")?.toLowerCase() === "bytes" };
}

async function streamResponse(response: Response, path: string, progress: (bytes: number) => void): Promise<void> {
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) for ${response.url}`);
  const file = Bun.file(path).writer();
  try {
    for await (const chunk of response.body) {
      file.write(chunk);
      progress(chunk.byteLength);
    }
  } finally {
    await file.end();
  }
}

/** Downloads a file with parallel HTTP ranges when supported and atomically publishes it. */
export async function downloadFile(url: string, outputPath: string, options: DownloadOptions = {}): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const headers = { "User-Agent": USER_AGENT, ...options.headers };
  const info = await responseInfo(url, headers);
  const existing = await stat(outputPath).then((value) => value.size).catch(() => 0);
  if (info.length && existing === info.length) { options.onProgress?.(existing, info.length); return; }
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 8, 32));
  const tempPath = `${outputPath}.download`;
  let downloaded = 0;
  const progress = (bytes: number) => { downloaded += bytes; options.onProgress?.(downloaded, info.length); };

  if (!info.length || !info.ranges || concurrency === 1 || info.length < 8 * 1024 * 1024) {
    await rm(tempPath, { force: true });
    await streamResponse(await fetch(url, { headers, redirect: "follow" }), tempPath, progress);
  } else {
    const chunkSize = Math.ceil(info.length / concurrency);
    const parts = Array.from({ length: concurrency }, (_, index) => ({
      path: `${tempPath}.part-${index}`,
      start: index * chunkSize,
      end: Math.min(info.length! - 1, (index + 1) * chunkSize - 1),
    })).filter((part) => part.start <= part.end);

    await Promise.all(parts.map(async (part) => {
      const existing = await stat(part.path).then((value) => value.size).catch(() => 0);
      const expected = part.end - part.start + 1;
      if (existing === expected) { progress(existing); return; }
      await rm(part.path, { force: true });
      const response = await fetch(url, { headers: { ...headers, Range: `bytes=${part.start}-${part.end}` }, redirect: "follow" });
      if (response.status !== 206) throw new Error(`Server ignored byte range for ${url}`);
      await streamResponse(response, part.path, progress);
    }));

    await rm(tempPath, { force: true });
    const output = await open(tempPath, "w");
    try {
      const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
      for (const part of parts) {
        const input = await open(part.path, "r");
        try {
          let read = 0;
          do { ({ bytesRead: read } = await input.read(buffer, 0, buffer.length)); if (read) await output.write(buffer, 0, read); } while (read);
        } finally { await input.close(); }
      }
    } finally { await output.close(); }
    await Promise.all(parts.map((part) => rm(part.path, { force: true })));
  }

  if (info.length && (await stat(tempPath)).size !== info.length) throw new Error(`Downloaded size mismatch for ${url}`);
  await rm(outputPath, { force: true });
  await rename(tempPath, outputPath);
}
