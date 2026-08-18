# OneRep datasource

A small Bun HTTP service that replaces FatSecret. It serves USDA FoodData
Central foods, the Open Food Facts product catalog and the wger exercise
catalog out of local SQLite databases, using FTS5 for search. Storage is
`bun:sqlite` with Drizzle over the top.

Responses use the Open Food Facts-shaped payload the mobile client already
consumes, so Convex only has to forward requests.

## Layout

The service is a thin shell around a set of providers. A provider owns one
upstream catalog end to end — how it is fetched, the SQLite schema it lands in,
and how a row of that schema becomes the normalised shape everything else
speaks. Nothing outside a provider directory mentions its vocabulary, so
`fdc_id` appears only under `providers/usda/`.

```text
src/
  core/        provider contract, normalised types, lifecycle, DDL, ranking, CSV/JSONL
  providers/
    usda/      schema.ts + import.ts + normalize.ts + index.ts
    off/       Open Food Facts, same four files
    wger/      same four files
  registry.ts  the one place that knows which providers exist
  compat.ts    normalised types -> the wire format clients actually parse
  index.ts     routes, delegating everything to the registry
  cli.ts       imports and rollbacks, driven by the registry
```

Adding a catalog means adding a directory under `providers/` and one line in
`registry.ts`. The CLI's usage text, `/v1/stats` and the search merge all pick
it up from there.

### Providers and the normalised shape

`core/provider.ts` defines `FoodProvider` (`search`, `byId`, `byBarcode`) and
`ExerciseProvider` (`search`, `byId`), both of which return `Food` and
`Exercise` from `core/types.ts` rather than their own rows. Ids are
provider-qualified — `usda:171077` — and the registry routes on the prefix. A
bare id is offered to every provider in turn, so ids logged before the split
still resolve.

Search results carry a 0..1 relevance so the registry can interleave several
catalogs, weighted per provider in `registry.ts`. Those scores are only
strictly comparable within a provider; the weight expresses which catalog we
would rather show, not a correction for scale.

### Drizzle

The Drizzle tables in each provider's `schema.ts` are the only declaration of
its columns, and `core/ddl.ts` turns them into the `CREATE TABLE` that builds
the file. There are no migrations: an import builds a new database and swaps it
in, so there is nothing to migrate and drizzle-kit is not a dependency.

Two things stay raw SQL, deliberately. FTS5 virtual tables have no Drizzle
representation, so each provider declares its index and its one ranking query
by hand — and that query returns nothing but ids and scores, letting Drizzle
read the rows so the column list is never restated in snake_case.

Every statement in an import hot loop is a Drizzle **prepared** statement bound
with `sql.placeholder`. This matters more than it looks: measured on this
schema, prepared statements run at ~1.8M rows/s against raw `bun:sqlite`'s
~2.2M, but rebuilding the query per row collapses to ~88k rows/s. On
`food_nutrient.csv` that is the difference between a ten-second pass and a
five-minute one. `core/sql.ts` wraps the two places Drizzle's SQLite typings
fall short: placeholders inside `.set()`, and reading `changes()`.

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
GET /v1/foods/:id               # accepts "usda:123456" or a bare FDC id
GET /v1/barcodes/:barcode       # UPC-A, EAN-13 and separator forms all resolve
GET /v1/exercises/search?q=bench+press&limit=20
GET /v1/exercises/:id           # "wger:345", a numeric wger id, or a uuid
```

Every response carries `attribution` (a provider id, unchanged from the
FatSecret-era payload) and, additively, `providers` — the id and display credit
of each provider that contributed, which is what CC-BY-SA and ODbL catalogs
require be shown.

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
DATA_DIR=./data bun src/cli.ts stats

# Open Food Facts: the gzipped JSONL dump is read as-is, never expanded
curl -O https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
DATA_DIR=./data bun src/cli.ts import off --file openfoodfacts-products.jsonl.gz

# ...or a partial import, which is the sane way to try it on a small box
DATA_DIR=./data bun src/cli.ts import off --file openfoodfacts-products.jsonl.gz --limit 50000
```

Run `bun src/cli.ts` with no arguments for usage; it is generated from the
registry, so a new provider appears there without the CLI being touched.

The USDA release ships ~3.1 GB of CSV, so every file is streamed rather than
loaded. A full import takes roughly 3.5 minutes and produces a ~1.2 GB database
holding about 455,000 distinct products, cleaned down from 2,007,635 parsed
rows.

### USDA: cleanup passes

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

### USDA: two gotchas worth remembering

`food_nutrient.nutrient_id` joins on `nutrient.id` (protein = 1003), **not** on
`nutrient_nbr`, which holds the legacy SR numbering (protein = 203). Getting
this wrong imports every food with zero macros and still looks like a
successful build, so the importer aborts when fewer nutrient ids match than
expected.

`fdc_id` is declared `INTEGER PRIMARY KEY` so it aliases the rowid. The branded
and nutrient passes issue millions of `UPDATE ... WHERE fdc_id = ?` statements;
without the rowid alias each one scans two million rows.

### Open Food Facts

The dump is one JSON object per line, ~12 GB gzipped. It is streamed and
gunzipped in a single pass and the `.gz` is read directly, so it never has to be
expanded onto disk. Measured on a 4 GB box: **3,187,767 products kept from
4,686,548 scanned in ~20 minutes, peak 2.8 GB, 1.19 GB on disk.**

Two things keep it inside that memory budget, and both were learned by watching
it get OOM-killed. `core/jsonl.ts` decompresses through `node:zlib` rather than
`DecompressionStream`, which ignores backpressure in Bun and queues the whole
expanded dump. And rows are committed in batches (`commitEvery`), because Bun's
SQLite build refuses `journal_mode = OFF` — it reports `delete` back however you
set it — so an open transaction pins every dirty page it has touched.

Imported with no country filter, so the catalog is global. A product is kept
only if it has a barcode, a name, and some nutrition; the last of those is what
does most of the size work — about a third of the dump is skeleton records with
no nutrition panel yet.

**Open Food Facts is mid-migration between two nutrition formats and both must
be read.** Older records use the flat `nutriments` map; migrated ones leave it
empty and fill `nutrition.input_sets`. Reading only the legacy map imports 21%
of the catalog and silently loses Nutella. Note that the *API* still computes
the legacy view, so verifying against `world.openfoodfacts.org/api` will not
show you this — check a record from the dump itself.

The newer format needs more care than a rename. Values carry their own unit
(`g`, `mg`, `µg`, `kcal`, `kJ`) instead of being pre-normalised to grams, so the
unit is honoured and `% DV` and `IU` are dropped rather than guessed — a
percentage of a daily value needs a reference intake to invert and IU is
substance-specific, and a plausible-looking wrong number on a nutrition label is
worse than a gap. A record also carries several `input_sets`: per-serving and
per-100ml variants, `prepared` variants, and sets holding nothing but scoring
metadata. Coca-Cola's first per-100g set contains only `nova-group`, so
preferring grams and stopping there drops the product; Nutella spreads its
macros, fibre and vitamins across three sets. Every usable as-sold 100-unit set
is therefore merged, first-declared value winning.

The dump has no `image_front_small_url` either — that is computed by the API.
Image URLs are assembled from `images.selected.front.<lang>.rev` and a barcode
split into 3/3/3/rest. Repeated barcodes are collapsed onto
the most complete row, and a handful of malformed lines are tolerated and
counted — more than a thousand aborts the import as a truncated download.

Names are stored in both the product's own language and English where a
contributor supplied one, and both are indexed, so a French chocolate bar is
found by "chocolat noir" and by "dark chocolate" alike. English is preferred
for display; the original stays searchable.

**Every OFF nutrient is published in grams**, whatever the label said —
`sodium_100g: 0.0428` carries `sodium_unit: "g"`, and `vitamin-c_100g: 0.0543`
means 54.3 mg. The normalised shape wants milligrams for minerals and
micrograms for vitamins A and D, so `providers/off/normalize.ts` scales by 1e3
and 1e6. Get a factor wrong and nothing looks broken — the numbers stay
plausible and only the units are nonsense — which is why the scaling is a
table rather than open-coded per field, and why it is tested against values
taken verbatim from live records.

Energy falls back from `energy-kcal_100g` to `energy_100g` (kilojoules, which
is what EU labels carry) at 4.184 kJ per kcal, and sodium falls back to
`salt_100g / 2.5` for the many European products that declare only salt.

### Ranking

Search is FTS5 BM25 over name and brand, adjusted by a data-type prior:
Foundation, then SR Legacy, then Survey/FNDDS, then Branded. The prior is
deliberately stronger than the exact-name bonus, because thousands of branded
products are named exactly "CHICKEN BREAST" and would otherwise bury the
generic ingredient. Only foods matching every query token are candidates, so
the prior decides between comparable matches rather than suppressing better
ones. Weights live at the top of `src/providers/usda/index.ts`.

The tier prior itself lives in `src/core/ranking.ts`, not in either provider,
because it is the one number two catalogs have to agree on. A provider's BM25
weights are its own business; its *prior* is not. Open Food Facts is wholly
branded packaged product and so enters the merge at the branded tier. Skipping
that would score every OFF product as though it were a lab-measured generic
food and push USDA's entire branded catalog — which does carry the penalty —
out of results the moment OFF is imported.

The resulting order is: USDA generic foods, then packaged products from either
catalog, with the per-provider weight in `src/registry.ts` deciding between two
packaged goods. OFF sits at 0.85 against USDA's 1.0, so a USDA branded row wins
a near-tie; it is a tie-break, not a veto, and a clearly better OFF match still
comes first. That weight is the knob to turn if EU packaged goods should lead.

Names are additionally stored as a punctuation-free `name_key`, so USDA's
comma-inverted "Chicken, breast, raw" still prefix-matches what a user types.

## Safe database promotion

Imports never modify the database currently serving requests. Each run builds
`<provider>.next.sqlite`, runs `PRAGMA integrity_check`, refuses to promote an
empty result, then swaps it into place with filesystem renames and keeps the
outgoing file as `<provider>.previous.sqlite`. A failed build leaves the live
database untouched.

The server notices a promotion by re-checking the live file's inode at most
once every ten seconds, so a swapped database is picked up without a restart.

Keep the database directory and staging files on the same filesystem so the
renames stay atomic.

## Attribution

USDA FoodData Central is public domain. The wger catalog is CC-BY-SA 4.0: the
`license` and `licenseAuthor` fields come back on every exercise and must be
displayed wherever an image or description is shown.

Open Food Facts is under the Open Database License (ODbL), with product images
under CC-BY-SA. Attribution is required wherever its data appears, which is why
every response carries a `providers` array naming each catalog that contributed
to it.
