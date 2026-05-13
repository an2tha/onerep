## 2025-05-14 - Hardcoded Database Credentials and Fail-Secure Enforcement
**Vulnerability:** The application contained hardcoded PostgreSQL connection strings in multiple files, which included plaintext usernames and passwords.
**Learning:** Hardcoded credentials provide a single point of failure and risk exposure in source control. Relying on fallback values for environment variables can lead to the application running in an insecure or unintended state if the environment is misconfigured.
**Prevention:** Remove all hardcoded credentials. Enforce the presence of critical security environment variables (like `DATABASE_URL` and `DATA_API_KEY`) at startup and throw an error if they are missing, ensuring the application "fails securely" rather than defaulting to insecure configurations.

## 2025-05-15 - Redundant DDL and DoS Risk in API Endpoints
**Vulnerability:** API endpoints were executing DDL operations (CREATE INDEX, CREATE EXTENSION) on every request and lacked strict input validation for pagination and batch lookups.
**Learning:** Executing DDL in request handlers forces the application to run with elevated database privileges (e.g., superuser/owner) in production, violating the principle of least privilege. Missing input caps on 'limit' and 'ids' parameters create trivial DoS vectors.
**Prevention:** Centralize database initialization (extensions/indexes) to a startup function and use a shared connection pool. Enforce strict input validation using Zod with hardcoded maximums for all collection-returning endpoints.
