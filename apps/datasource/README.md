# OneRep datasource

A small Bun HTTP service that replaces FatSecret. It serves USDA FoodData
Central foods and the wger exercise catalog out of local SQLite databases,
using FTS5 for search. `bun:sqlite` is the only storage dependency; there is no
ORM, no DuckDB and no Open Food Facts import.

Responses use the Open Food Facts-shaped payload the mobile client already
consumes, so Convex only has to forward requests.

## Run

```bash
API_TOKEN=$(openssl rand -hex 32) bun run dev
```

Environment variables:

- `HOST` — defaults to `127.0.0.1`. Widen it only as far as the Cloudflare
  tunnel host requires, and pair it with a firewall rule scoped to that host;
  never expose the port to the public internet
- `PORT` — defaults to `3100`
- `DATA_DIR` — SQLite location, defaults to `apps/datasource/data`
- `API_TOKEN` — required for every `/v1/*` endpoint (min 32 chars)

Only `/health` is unauthenticated. There are no CORS headers: this service is
called server-side from Convex only, never from a browser.

## Read API

```text
GET /health
GET /v1/stats
GET /v1/foods/search?q=greek+yogurt&limit=20
GET /v1/foods/:fdcId            # accepts "usda:123456" or a bare FDC id
GET /v1/barcodes/:barcode       # UPC-A, EAN-13 and separator forms all resolve
GET /v1/exercises/search?q=bench+press&limit=20
GET /v1/exercises/:id           # numeric wger id or uuid
```

## Imports

Imports run from the shell, not over HTTP. The service is reachable from the
internet through a Cloudflare tunnel, and no remote caller has any reason to
trigger or roll back a rebuild — so there are no `/admin/*` routes to attack.

```bash
# USDA: download and unzip a release first
curl -O https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_csv_2025-12-18.zip
unzip -q FoodData_Central_csv_2025-12-18.zip -d usda

DATA_DIR=./data bun src/cli.ts import usda --csv-dir usda/FoodData_Central_csv_2025-12-18
DATA_DIR=./data bun src/cli.ts import wger
DATA_DIR=./data bun src/cli.ts rollback usda
```

The USDA release ships ~3.1 GB of CSV, so every file is streamed rather than
loaded. A full import takes roughly 3.5 minutes and produces a ~1.2 GB database
holding about 455,000 distinct products, cleaned down from 2,007,635 parsed
rows.

### Cleanup passes

After loading, the importer runs three passes:

1. **Energy derivation.** USDA omits nutrient 1008 on many branded records that
   still carry complete macros, so energy is computed with the Atwater factors
   (4/4/9). This recovers about 30,000 foods.
2. **De-duplication.** USDA republishes a GTIN on every release, so the branded
   set holds roughly four rows per physical product. Rows are grouped by GTIN,
   or by name and source when there is no GTIN, and the most complete row wins.
   This collapses about 1.55M rows.
3. **Dropping empty foods.** Anything left with neither energy nor macros is
   removed — it cannot be logged, and it otherwise appears in search as a
   convincing zero-calorie entry.

The passes run in that order on purpose: de-duplicating first means an empty
row that repeats a populated one is aliased onto it instead of being discarded,
which is why only a few hundred foods are actually dropped.

Every retired `fdc_id` is recorded in the `aliases` table, and `GET
/v1/foods/:id` falls back through it. A food logged before an import still
resolves afterwards rather than 404ing.

### Ranking

Search is FTS5 BM25 over name and brand, adjusted by a data-type prior:
Foundation, then SR Legacy, then Survey/FNDDS, then Branded. The prior is
deliberately stronger than the exact-name bonus, because thousands of branded
products are named exactly "CHICKEN BREAST" and would otherwise bury the
generic ingredient. Only foods matching every query token are candidates, so
the prior decides between comparable matches rather than suppressing better
ones. Weights live at the top of `src/search.ts`.

Names are additionally stored as a punctuation-free `name_key`, so USDA's
comma-inverted "Chicken, breast, raw" still prefix-matches what a user types.

### Two USDA gotchas worth remembering

`food_nutrient.nutrient_id` joins on `nutrient.id` (protein = 1003), **not** on
`nutrient_nbr`, which holds the legacy SR numbering (protein = 203). Getting
this wrong imports every food with zero macros and still looks like a
successful build, so the importer aborts when fewer nutrient ids match than
expected.

`fdc_id` is declared `INTEGER PRIMARY KEY` so it aliases the rowid. The branded
and nutrient passes issue millions of `UPDATE ... WHERE fdc_id = ?` statements;
without the rowid alias each one scans two million rows.

## Safe database promotion

Imports never modify the database currently serving requests. Each run builds
`<source>.next.sqlite`, runs `PRAGMA integrity_check`, refuses to promote an
empty result, then swaps it into place with filesystem renames and keeps the
outgoing file as `<source>.previous.sqlite`. A failed build leaves the live
database untouched.

The server notices a promotion by re-checking the live file's inode at most
once every ten seconds, so a swapped database is picked up without a restart.

Keep the database directory and staging files on the same filesystem so the
renames stay atomic.

## Attribution

USDA FoodData Central is public domain. The wger catalog is CC-BY-SA 4.0: the
`license` and `licenseAuthor` fields come back on every exercise and must be
displayed wherever an image or description is shown.
