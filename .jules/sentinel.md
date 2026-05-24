## 2025-05-14 - Hardcoded Database Credentials and Fail-Secure Enforcement
**Vulnerability:** The application contained hardcoded PostgreSQL connection strings in multiple files, which included plaintext usernames and passwords.
**Learning:** Hardcoded credentials provide a single point of failure and risk exposure in source control. Relying on fallback values for environment variables can lead to the application running in an insecure or unintended state if the environment is misconfigured.
**Prevention:** Remove all hardcoded credentials. Enforce the presence of critical security environment variables (like `DATABASE_URL` and `DATA_API_KEY`) at startup and throw an error if they are missing, ensuring the application "fails securely" rather than defaulting to insecure configurations.

## 2025-05-15 - DoS Prevention via Connection Pooling and Input Capping
**Vulnerability:** Redundant database pool creation and missing input validation on query limits created a Denial of Service (DoS) risk through connection and resource exhaustion.
**Learning:** Initializing database resources (pools, extensions, indexes) within route handlers or across multiple files leads to inefficient resource usage and predictable failure points under load. User-controlled query parameters without strict bounds can be exploited to crash the service.
**Prevention:** Centralize database connection management in a shared pool and perform all DDL initialization once during server startup. Enforce strict input validation using schemas (e.g., Zod) to cap result sets and validate parameter formats before they reach the database layer.
