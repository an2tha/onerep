## 2025-05-14 - Hardcoded Database Credentials and Fail-Secure Enforcement
**Vulnerability:** The application contained hardcoded PostgreSQL connection strings in multiple files, which included plaintext usernames and passwords.
**Learning:** Hardcoded credentials provide a single point of failure and risk exposure in source control. Relying on fallback values for environment variables can lead to the application running in an insecure or unintended state if the environment is misconfigured.
**Prevention:** Remove all hardcoded credentials. Enforce the presence of critical security environment variables (like `DATABASE_URL` and `DATA_API_KEY`) at startup and throw an error if they are missing, ensuring the application "fails securely" rather than defaulting to insecure configurations.

## 2025-05-15 - Redundant Database Initialization and DoS via Resource Exhaustion
**Vulnerability:** The Data API performed expensive database initialization (creating extensions and indexes) on every search request and lacked strict validation on query parameters like `limit` and `ids`, exposing it to Denial of Service (DoS) and potential performance degradation.
**Learning:** Performing DDL (Data Definition Language) operations in the request path is inefficient and can cause locking issues (especially without `CONCURRENTLY`). Lack of input capping allows attackers to request massive datasets, exhausting server and database resources.
**Prevention:** Move database initialization to a dedicated startup sequence. Use `CREATE INDEX CONCURRENTLY` outside of transaction blocks to avoid table locks. Enforce strict Zod validation with mandatory maximum limits (e.g., `limit` capped at 100) on all API endpoints.
