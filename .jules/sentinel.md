## 2025-05-14 - Hardcoded Database Credentials and Fail-Secure Enforcement
**Vulnerability:** The application contained hardcoded PostgreSQL connection strings in multiple files, which included plaintext usernames and passwords.
**Learning:** Hardcoded credentials provide a single point of failure and risk exposure in source control. Relying on fallback values for environment variables can lead to the application running in an insecure or unintended state if the environment is misconfigured.
**Prevention:** Remove all hardcoded credentials. Enforce the presence of critical security environment variables (like `DATABASE_URL` and `DATA_API_KEY`) at startup and throw an error if they are missing, ensuring the application "fails securely" rather than defaulting to insecure configurations.

## 2025-05-27 - Schema Regression during Security Hardening
**Vulnerability:** Widespread API input validation was attempted but caused a functional regression by applying a food-specific search schema to exercise-specific routes, stripping necessary parameters like 'muscle' and 'equipment'.
**Learning:** Security hardening must be context-aware. Reusing generic schemas for distinct domains (foods vs. exercises) can lead to data loss and broken features.
**Prevention:** Implement domain-specific validation schemas and ensure security changes are verified against the specific functional requirements of each endpoint.
