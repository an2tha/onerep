## 2025-05-15 - [Security Enhancements for Data API]
**Vulnerability:** The `apps/data-api` was missing standard security headers, had overly permissive CORS, and lacked authentication for its internal endpoints, which are consumed by the Convex backend.
**Learning:** Security middleware like `helmet` and `cors` should be among the first things configured in any public-facing Express application. For internal service-to-service communication, a simple but secure API key with timing-safe comparison is an effective first layer of defense.
**Prevention:** Always include `helmet` and restricted `cors` in Express app templates. Enforce API key or JWT validation for all sensitive routes. Ensure ID validation matches the underlying database type (PostgreSQL in this case).
