import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { downloadFile } from "./downloader.ts";

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
  let lastReported = 0;
  await downloadFile(url, outputPath, { concurrency: Number(process.env.DOWNLOAD_CONCURRENCY) || 8, onProgress(received, total) {
    if (received - lastReported < 100 * 1024 * 1024 && received !== total) return;
    lastReported = received;
    console.log(`Downloaded ${(received / 1024 / 1024).toFixed(0)}${total ? `/${(total / 1024 / 1024).toFixed(0)}` : ""} MB → ${outputPath}`);
  } });
}

export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
