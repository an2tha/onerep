## 2025-05-15 - Hardcoded Credentials and Unauthenticated API
**Vulnerability:** The Express Data API had hardcoded PostgreSQL connection strings and lacked authentication for its endpoints, exposing data and potentially sensitive environment configuration.
**Learning:** Legacy development patterns often leave "placeholder" credentials that bypass environment variable configurations, and internal APIs may be overlooked for security under the assumption they are isolated.
**Prevention:** Enforce environment variable checks at startup and implement centralized authentication middleware for all API route groups from the beginning.
