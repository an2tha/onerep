# deploy/

The bits of the production datasource host that live outside `src/`.

This box was provisioned by hand, so until now none of it was in the repository
— the only copy of these files was on the machine itself. They are captured here
so a rebuild does not depend on someone remembering what was configured, and so
changes to them get reviewed like anything else.

**These files are not applied automatically.** They are the current contents of
`root@192.168.50.53`, and editing one here changes nothing until it is copied
over and reloaded. See "Applying" below.

| File | Installed at | Purpose |
| ---- | ------------ | ------- |
| `onerep-datasource.service` | `/etc/systemd/system/` | The service itself: runs `src/index.ts` as the `datasource` user, `MemoryMax=2G`, writes only to `/var/lib/onerep-datasource` |
| `onerep-datasource-warmcache.service` | `/etc/systemd/system/` | Re-reads the SQLite files so they stay in page cache |
| `onerep-datasource-warmcache.timer` | `/etc/systemd/system/` | Runs the above every 5 minutes |
| `off-seed.sh` | `/usr/local/sbin/` | Downloads and imports the Open Food Facts export |

## Why the warm cache exists

Slow food search on this host has always been a cold page cache, never the
query. The databases total ~2.4 GB on a 4 GB box that also runs a build agent,
and once a database is evicted a search goes from ~40 ms to several seconds
until it pages back in. The timer re-reads the files to keep them resident.

`vmtouch -l` would be the airtight fix but does not work here: the host caps
`RLIMIT_MEMLOCK` at 8 MB for this unprivileged LXC container and root inside
cannot raise it, so locking dies with `ENOMEM`. Re-reading on a timer degrades
gracefully instead of risking OOM.

**Every database the service serves must be listed in the warm-cache
`ExecStart`.** Adding a provider and forgetting this leaves its database as the
first thing evicted under memory pressure — which is exactly what happened when
Open Food Facts was added.

## Applying

```sh
scp deploy/*.service deploy/*.timer root@<host>:/etc/systemd/system/
scp deploy/off-seed.sh root@<host>:/usr/local/sbin/
ssh root@<host> 'chmod 755 /usr/local/sbin/off-seed.sh && systemctl daemon-reload'
ssh root@<host> 'systemctl restart onerep-datasource onerep-datasource-warmcache.timer'
```

Secrets are not here and must not be. `PORT`, `HOST`, `DATA_DIR`, `CACHE_DIR`
and `API_TOKEN` live in `/etc/onerep-datasource/env` (mode 0640, root:datasource)
and are referenced by the unit's `EnvironmentFile`.

## Deploying the application

`/opt/onerep-datasource` is not a git checkout — a deploy is an rsync of `src/`,
`package.json` and `tsconfig.json` followed by `bun install` on the box, because
the service now has a real dependency (`drizzle-orm`) where it once had none.

Stage and prove it against real data before taking the live service down:

```sh
rsync -az --exclude node_modules --exclude data \
  src package.json tsconfig.json root@<host>:/opt/onerep-datasource.new/
ssh root@<host> 'cd /opt/onerep-datasource.new && bun install'
# canary: run the staged code on a spare port against the real DATA_DIR
# then swap: stop, mv old aside, mv new in, start, verify /v1/stats
```

The USDA and wger schemas have so far survived every rewrite unchanged, so
existing databases are read as-is and never need re-importing on deploy. That is
worth re-checking rather than assuming when a schema changes.

## Seeding

```sh
ssh root@<host> 'systemd-run --unit=off-seed --collect \
  --uid=datasource --gid=datasource \
  --property=Nice=10 --property=IOSchedulingClass=idle \
  --property=MemoryMax=3500M --property=TimeoutStartSec=infinity \
  /usr/local/sbin/off-seed.sh'
ssh root@<host> 'journalctl -u off-seed -f'
```

USDA and wger are imported with `bun src/cli.ts import usda --csv-dir <dir>` and
`... import wger`; see the main [README](../README.md).

An import never touches the live database — it builds a staging file and swaps
it in — so a failed or killed import leaves the running service untouched.
Afterwards, check a real barcode rather than the row count: an importer that
cannot parse its input reports a clean build with far too few products.

## Differences from what is running

`off-seed.sh` here is the generalised version. The copy that ran the first seed
had the dump's byte count hard-coded and waited on a separate transient
download unit; this one reads the published `Content-Length` and downloads the
file itself, resuming if interrupted. It has been copied back to the host, so
the two match.
