## 2025-05-14 - Hardcoded Database Credentials and Fail-Secure Enforcement
**Vulnerability:** The application contained hardcoded PostgreSQL connection strings in multiple files, which included plaintext usernames and passwords.
**Learning:** Hardcoded credentials provide a single point of failure and risk exposure in source control. Relying on fallback values for environment variables can lead to the application running in an insecure or unintended state if the environment is misconfigured.
**Prevention:** Remove all hardcoded credentials. Enforce the presence of critical security environment variables (like `DATABASE_URL` and `DATA_API_KEY`) at startup and throw an error if they are missing, ensuring the application "fails securely" rather than defaulting to insecure configurations.

## 2025-05-15 - Inconsistent ID Validation Constraints
**Vulnerability:** Applying overly restrictive regex patterns (e.g., MongoDB ObjectID format) to ID validation in a system that uses mixed ID formats (integers and alphanumeric strings) can lead to a denial of service for legitimate requests.
**Learning:** Security enhancements like input validation must be tailored to the specific data formats used by the application. Blindly applying "standard" security patterns without verifying the underlying data structures (e.g., PostgreSQL serial vs. custom alphanumeric IDs) causes functional regressions.
**Prevention:** Always audit existing data formats and database schemas before implementing validation constraints. Use broad but safe validation (like `min(1)`) when multiple formats must be supported, and only use specific regexes when the format is guaranteed to be uniform.
