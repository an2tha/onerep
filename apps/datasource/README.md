# OneRep datasource

A small Bun HTTP service providing locally indexed USDA foods and Open Food
Facts barcode products. Drizzle uses Bun's native SQLite driver. DuckDB only
projects wide OFF Parquet exports into the compact product schema.

## Run

```bash
ADMIN_TOKEN=change-me bun run dev
```

Environment variables:

- `PORT` — defaults to `3100`
- `DATA_DIR` — SQLite location, defaults to `apps/datasource/data`
- `CACHE_DIR` — downloaded archives and intermediate files
- `ADMIN_TOKEN` — required for every `/admin/*` endpoint
- `CORS_ORIGIN` — defaults to `*`

## Read API

```text
GET /health
GET /v1/stats
GET /v1/foods/search?q=greek+yogurt&limit=20
GET /v1/foods/:fdcId
GET /v1/barcodes/:barcode
GET /v1/products/search?q=hazelnut&limit=20
```

OFF product-name search only contains data when `withSearch` is enabled during
the import. Exact barcode lookup is always available.

## Build/update USDA

The server discovers the newest official USDA JSON downloads. Foundation and
Survey/FNDDS are imported by default; SR Legacy is optional because it is much
larger in memory while unpacking.

```bash
curl -X POST http://localhost:3100/admin/sync/usda \
  -H 'Authorization: Bearer change-me' \
  -H 'Content-Type: application/json' \
  -d '{"datasets":["foundation","survey"]}'
```

## Build/update Open Food Facts

The production database retains only barcode identity, display fields, core
nutrition and a few optional nutrients. Country filtering happens in DuckDB
before data reaches SQLite.

```bash
curl -X POST http://localhost:3100/admin/sync/openfoodfacts \
  -H 'Authorization: Bearer change-me' \
  -H 'Content-Type: application/json' \
  -d '{
    "input":"/imports/openfoodfacts.parquet",
    "countries":["germany","austria","switzerland"],
    "withSearch":false
  }'
```

Alternatively pass a downloadable Parquet `url`. The response is a job object;
poll `GET /admin/jobs/:id` until it completes.

## Safe database promotion

Sync jobs never clear or modify the database currently serving requests. Each
job builds a uniquely named `*.next.sqlite`, runs `PRAGMA integrity_check`,
requires a non-empty result, checkpoints WAL, and closes the staged database.
It then promotes the file with filesystem renames and keeps the former database
as `usda.previous.sqlite` or `off.previous.sqlite`.

If a build or validation fails, the staged files are deleted and the live
database remains open and unchanged. If the process is interrupted between the
rename operations, startup restores the previous database when the live path is
missing.

Manual rollback is available through authenticated endpoints:

```text
POST /admin/rollback/usda
POST /admin/rollback/openfoodfacts
```

`GET /v1/stats` reports whether each source is currently building and whether
a rollback database is available. Keep the database directory and staging files
on the same mounted filesystem so renames remain atomic.

Imports are maintenance operations. Run them when the service can tolerate
reduced responsiveness, then retain the source SQLite files as deployable
artifacts/backups.
