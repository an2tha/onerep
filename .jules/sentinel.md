## 2025-05-14 - [Centralized DB Init & Input Validation]
**Vulnerability:** Redundant database initialization in request handlers (DoS risk) and missing/weak input validation on search and lookup endpoints. Hardcoded DB credentials in config.
**Learning:** Performing `CREATE INDEX CONCURRENTLY` in Express request handlers can lead to resource exhaustion and transaction errors. Lack of `LIMIT` validation allows for large data extraction via API.
**Prevention:** Centralize DB initialization (extensions/indexes) to application startup. Enforce strict Zod schemas for all query and path parameters, specifically capping `limit` and `ANY()` array sizes. Use environment variables exclusively for database connection strings.
