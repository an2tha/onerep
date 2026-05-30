## 2025-05-14 - Hardcoded Database Credentials and Fail-Secure Enforcement
**Vulnerability:** The application contained hardcoded PostgreSQL connection strings in multiple files, which included plaintext usernames and passwords.
**Learning:** Hardcoded credentials provide a single point of failure and risk exposure in source control. Relying on fallback values for environment variables can lead to the application running in an insecure or unintended state if the environment is misconfigured.
**Prevention:** Remove all hardcoded credentials. Enforce the presence of critical security environment variables (like `DATABASE_URL` and `DATA_API_KEY`) at startup and throw an error if they are missing, ensuring the application "fails securely" rather than defaulting to insecure configurations.

## 2026-05-30 - Centralized DB Initialization and Robust Input Validation
**Vulnerability:** API routes were performing redundant and resource-intensive database initialization (extensions and indexes) on every request, creating a DoS vector. Additionally, several endpoints lacked strict input validation, potentially exposing the system to unexpected data or resource exhaustion.
**Learning:** Performing DDL operations in request handlers is inefficient and risky. Centralizing these in a startup routine ensures they run once and predictably. Combining this with standardized Zod-based validation across all user-facing routes provides a consistent security posture.
**Prevention:** Always move infrastructure setup (indexes, extensions) to an application-level initialization phase. Use comprehensive validation schemas (like Zod) for all external inputs (params, query, body) to enforce type safety and logical constraints (e.g., maximum limits).
