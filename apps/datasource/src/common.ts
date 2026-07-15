import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function required(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

export function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

export function options(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === `--${name}` && args[index + 1]) values.push(args[index + 1]!);
  }
  return values;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

export async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
}

export async function replaceFile(tempPath: string, outputPath: string): Promise<void> {
  await rm(outputPath, { force: true });
  await rename(tempPath, outputPath);
}

export function finite(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function plausible(value: number | undefined, max: number): number | undefined {
  return value !== undefined && value >= 0 && value <= max ? value : undefined;
}

export function jsonOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export async function download(url: string, outputPath: string): Promise<void> {
  await ensureParent(outputPath);
  const response = await fetch(url, { headers: { "User-Agent": "OneRep-Datasource/1.0 (app.onerep.life)" } });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) for ${url}`);
  const file = Bun.file(outputPath);
  const writer = file.writer();
  const reader = response.body.getReader();
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    writer.write(value);
    received += value.byteLength;
    if (received > 0 && received % (100 * 1024 * 1024) < value.byteLength) console.log(`Downloaded ${(received / 1024 / 1024).toFixed(0)} MB…`);
  }
  await writer.end();
}

export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
