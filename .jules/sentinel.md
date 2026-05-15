## 2025-05-14 - Hardcoded Database Credentials and Fail-Secure Enforcement
**Vulnerability:** The application contained hardcoded PostgreSQL connection strings in multiple files, which included plaintext usernames and passwords.
**Learning:** Hardcoded credentials provide a single point of failure and risk exposure in source control. Relying on fallback values for environment variables can lead to the application running in an insecure or unintended state if the environment is misconfigured.
**Prevention:** Remove all hardcoded credentials. Enforce the presence of critical security environment variables (like `DATABASE_URL` and `DATA_API_KEY`) at startup and throw an error if they are missing, ensuring the application "fails securely" rather than defaulting to insecure configurations.

## 2026-05-15 - Consolidated Connection Pool and Startup Initialization
**Vulnerability:** Redundant database connection pools were created in multiple route files, and Data Definition Language (DDL) commands (extension and index creation) were executed within search request handlers.
**Learning:** Duplicate pools can lead to database connection exhaustion and DoS. Executing DDL on every request is inefficient, risky (locking), and violates the principle of least privilege by mixing schema management with data retrieval.
**Prevention:** Centralize the connection pool into a shared instance and move all database initialization (extensions, indexes) to a startup function called during server boot.
