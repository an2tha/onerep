## 2025-05-14 - Hardcoded Database Credentials and Fail-Secure Enforcement
**Vulnerability:** The application contained hardcoded PostgreSQL connection strings in multiple files, which included plaintext usernames and passwords.
**Learning:** Hardcoded credentials provide a single point of failure and risk exposure in source control. Relying on fallback values for environment variables can lead to the application running in an insecure or unintended state if the environment is misconfigured.
**Prevention:** Remove all hardcoded credentials. Enforce the presence of critical security environment variables (like `DATABASE_URL` and `DATA_API_KEY`) at startup and throw an error if they are missing, ensuring the application "fails securely" rather than defaulting to insecure configurations.

## 2025-05-22 - Missing Input Validation and Resource Exhaustion Protection
**Vulnerability:** API endpoints in `apps/data-api` were directly using user-supplied query and path parameters in SQL queries without structured validation, and lacked enforced caps on result set sizes.
**Learning:** Relying on ad-hoc validation (like `parseInt` or manual defaults) is error-prone and often misses edge cases or fails to provide clear error feedback. Lack of strict limits on `limit` or list-based parameters (like `ids=...`) can be exploited for Denial-of-Service (DoS) attacks.
**Prevention:** Enforce structured input validation for ALL external API inputs using a library like Zod. Define central schemas that include strict typing, range checks (e.g., `.min(1).max(100)`), and safe defaults. Always use `safeParse` to return consistent 400 Bad Request responses instead of allowing malformed input to reach the data layer.
