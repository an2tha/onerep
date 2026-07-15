import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AtomicDatabaseSlot } from "./database-slot.ts";
import { syncUsda } from "./usda.ts";
import { syncOff } from "./off.ts";

const port = Number(process.env.PORT ?? 3100);
const dataDir = resolve(process.env.DATA_DIR ?? join(import.meta.dir, "../data"));
const cacheDir = resolve(process.env.CACHE_DIR ?? join(dataDir, "cache"));
await mkdir(cacheDir, { recursive: true });

const usda = new AtomicDatabaseSlot("usda", join(dataDir, "usda.sqlite"));
const off = new AtomicDatabaseSlot("off", join(dataDir, "openfoodfacts.sqlite"));
type Job = { id: string; kind: string; status: "running" | "completed" | "failed"; startedAt: string; finishedAt?: string; rows?: number; error?: string };
const jobs = new Map<string, Job>();

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*" } });
}
function authorized(request: Request): boolean {
  const token = process.env.ADMIN_TOKEN; return Boolean(token && request.headers.get("Authorization") === `Bearer ${token}`);
}
function limit(url: URL): number { return Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 20, 50)); }
async function body(request: Request): Promise<Record<string, unknown>> { return await request.json() as Record<string, unknown>; }
function startJob(kind: string, work: (jobId: string) => Promise<number>): Job {
  const job: Job = { id: crypto.randomUUID(), kind, status: "running", startedAt: new Date().toISOString() }; jobs.set(job.id, job);
  void work(job.id).then((rows) => Object.assign(job, { status: "completed", rows, finishedAt: new Date().toISOString() })).catch((error) => Object.assign(job, { status: "failed", error: error instanceof Error ? error.message : String(error), finishedAt: new Date().toISOString() }));
  return job;
}

const server = Bun.serve({
  port,
  idleTimeout: 30,
  async fetch(request) {
    const url = new URL(request.url); const path = url.pathname;
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
      if (request.method === "GET" && path === "/health") return json({ ok: true });
      if (request.method === "GET" && path === "/v1/stats") return json({ usda: { ...usda.db.stats(), building: usda.isBuilding, rollbackAvailable: usda.hasRollback }, openFoodFacts: { ...off.db.stats(), building: off.isBuilding, rollbackAvailable: off.hasRollback } });
      if (request.method === "GET" && path === "/v1/foods/search") { const q = url.searchParams.get("q")?.trim() ?? ""; if (q.length < 2) return json({ error: "q must contain at least 2 characters" }, 400); return json({ items: usda.db.searchFoods(q, limit(url)) }); }
      const foodMatch = path.match(/^\/v1\/foods\/(\d+)$/); if (request.method === "GET" && foodMatch) { const item = usda.db.food(Number(foodMatch[1])); return item ? json(item) : json({ error: "Food not found" }, 404); }
      const barcodeMatch = path.match(/^\/v1\/barcodes\/(\d{8,14})$/); if (request.method === "GET" && barcodeMatch) { const item = off.db.barcode(barcodeMatch[1]!); return item ? json(item) : json({ error: "Product not found" }, 404); }
      if (request.method === "GET" && path === "/v1/products/search") { const q = url.searchParams.get("q")?.trim() ?? ""; if (q.length < 2) return json({ error: "q must contain at least 2 characters" }, 400); return json({ items: off.db.searchProducts(q, limit(url)) }); }
      if (path.startsWith("/admin/") && !authorized(request)) return json({ error: "Unauthorized" }, 401);
      if (request.method === "GET" && path.startsWith("/admin/jobs/")) { const job = jobs.get(path.slice("/admin/jobs/".length)); return job ? json(job) : json({ error: "Job not found" }, 404); }
      if (request.method === "POST" && path === "/admin/sync/usda") {
        const input = await body(request); const allowed = new Set(["foundation", "survey", "legacy"]); const datasets = Array.isArray(input.datasets) ? input.datasets.map(String).filter((item) => allowed.has(item)) as Array<"foundation" | "survey" | "legacy"> : undefined;
        return json(startJob("usda", (jobId) => usda.buildAndPromote(jobId, (db) => syncUsda({ db, cacheDir, datasets }))), 202);
      }
      if (request.method === "POST" && path === "/admin/sync/openfoodfacts") {
        const input = await body(request); const countries = Array.isArray(input.countries) ? input.countries.map(String).slice(0, 20) : [];
        return json(startJob("openfoodfacts", (jobId) => off.buildAndPromote(jobId, (db) => syncOff({ db, cacheDir, input: typeof input.input === "string" ? resolve(input.input) : undefined, url: typeof input.url === "string" ? input.url : undefined, countries, withSearch: input.withSearch === true }))), 202);
      }
      if (request.method === "POST" && path === "/admin/rollback/usda") { usda.rollback(); return json({ ok: true, source: "usda" }); }
      if (request.method === "POST" && path === "/admin/rollback/openfoodfacts") { off.rollback(); return json({ ok: true, source: "openfoodfacts" }); }
      return json({ error: "Not found" }, 404);
    } catch (error) { console.error(error); return json({ error: error instanceof Error ? error.message : "Internal error" }, 500); }
  },
});

console.log(`OneRep datasource listening on ${server.url}`);
process.on("SIGTERM", () => { usda.close(); off.close(); server.stop(); });
