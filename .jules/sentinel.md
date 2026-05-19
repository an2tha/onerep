## 2025-05-14 - Hardcoded Database Credentials and Fail-Secure Enforcement
**Vulnerability:** The application contained hardcoded PostgreSQL connection strings in multiple files, which included plaintext usernames and passwords.
**Learning:** Hardcoded credentials provide a single point of failure and risk exposure in source control. Relying on fallback values for environment variables can lead to the application running in an insecure or unintended state if the environment is misconfigured.
**Prevention:** Remove all hardcoded credentials. Enforce the presence of critical security environment variables (like `DATABASE_URL` and `DATA_API_KEY`) at startup and throw an error if they are missing, ensuring the application "fails securely" rather than defaulting to insecure configurations.

## 2025-05-15 - Concurrent Index Creation and Resource Protection
**Vulnerability:** Performing DDL operations (like creating indexes) inside request handlers leads to redundant execution and potential DoS. Additionally, unvalidated query parameters for pagination and lookup lists could be used to exhaust server resources.
**Learning:** `CREATE INDEX CONCURRENTLY` in PostgreSQL cannot be executed within a transaction block. Drizzle's `db.execute` often wraps calls in transactions, requiring the use of a raw `pg.Pool` client for such operations. Centralizing these in a startup `initDb` function prevents race conditions and redundant execution.
**Prevention:** Execute DDL only once during application startup. Use Zod to enforce strict caps on pagination (e.g., `limit`) and list-based lookups (e.g., `ANY($1)` with a capped array) to prevent resource exhaustion attacks.
