#!/usr/bin/env bun
import { basename, join, resolve } from "node:path";
import { downloadFile } from "./downloader.ts";
import { discoverUsdaUrls } from "./usda.ts";

const OFF_URL = "https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet?download=true";
const args = Bun.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("-")) ?? "all";
const value = (name: string) => { const index = args.indexOf(`--${name}`); return index < 0 ? undefined : args[index + 1]; };
const output = resolve(value("output") ?? join(import.meta.dir, "../data/cache"));
const concurrency = Math.max(1, Math.min(Number(value("concurrency") ?? process.env.DOWNLOAD_CONCURRENCY) || 8, 32));

if (args.includes("--help") || !["all", "usda", "off"].includes(command)) {
  console.log(`OneRep source downloader

Usage:
  bun run download [all|usda|off] [--output DIR] [--concurrency 8]

Options:
  --off-url URL       Override the Open Food Facts Parquet URL
  --legacy            Also download USDA SR Legacy
  --concurrency N     Parallel HTTP ranges per file (1-32, default 8)

USDA_API_KEY is not required for bulk FoodData Central archives. Keep it in your
environment for separate calls to the USDA REST API; this tool never persists it.`);
  process.exit(args.includes("--help") ? 0 : 1);
}

function progress(label: string) {
  let last = 0;
  return (received: number, total?: number) => {
    if (received - last < 100 * 1024 * 1024 && received !== total) return;
    last = received;
    const percent = total ? ` ${(received / total * 100).toFixed(1)}%` : "";
    console.log(`${label}:${percent} ${(received / 1024 / 1024).toFixed(0)}${total ? `/${(total / 1024 / 1024).toFixed(0)}` : ""} MB`);
  };
}

const jobs: Promise<void>[] = [];
if (command === "all" || command === "usda") {
  const datasets: Array<"foundation" | "survey" | "legacy"> = ["foundation", "survey"];
  if (args.includes("--legacy")) datasets.push("legacy");
  const sources = await discoverUsdaUrls(datasets);
  for (const source of sources) {
    const target = join(output, basename(new URL(source.url).pathname));
    jobs.push(downloadFile(source.url, target, { concurrency, onProgress: progress(`USDA ${source.dataset}`) }).then(() => console.log(`Saved ${target}`)));
  }
}
if (command === "all" || command === "off") {
  const target = join(output, "openfoodfacts.parquet");
  jobs.push(downloadFile(value("off-url") ?? OFF_URL, target, { concurrency, onProgress: progress("Open Food Facts") }).then(() => console.log(`Saved ${target}`)));
}

await Promise.all(jobs);
console.log("Downloads complete.");
