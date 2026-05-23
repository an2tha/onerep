## 2025-05-14 - Hardcoded Database Credentials and Fail-Secure Enforcement
**Vulnerability:** The application contained hardcoded PostgreSQL connection strings in multiple files, which included plaintext usernames and passwords.
**Learning:** Hardcoded credentials provide a single point of failure and risk exposure in source control. Relying on fallback values for environment variables can lead to the application running in an insecure or unintended state if the environment is misconfigured.
**Prevention:** Remove all hardcoded credentials. Enforce the presence of critical security environment variables (like `DATABASE_URL` and `DATA_API_KEY`) at startup and throw an error if they are missing, ensuring the application "fails securely" rather than defaulting to insecure configurations.

## 2025-05-15 - API Hardening: DDL in Requests and Input Validation
**Vulnerability:** API endpoints performed DDL operations (extension/index creation) during standard GET requests and lacked strict input validation or result capping.
**Learning:** Executing DDL in request handlers is a significant DoS and stability risk. Lack of input validation and query limits allows for resource exhaustion attacks.
**Prevention:** Centralize database initialization to a startup-only sequence. Implement strict Zod validation for all API inputs and enforce mandatory pagination/limits on search results to prevent DoS.
