## 2025-05-14 - API Hardening and Timing-Safe Authentication
**Vulnerability:** The Express-based Data API lacked essential security headers, CORS configuration, and mandatory authentication. Furthermore, common string comparison for sensitive keys is vulnerable to timing attacks.
**Learning:** Legacy Express APIs often skip basic hardening (Helmet, CORS) and input validation, making them targets for XSS, DoS, and unauthorized access. Relying on simple equality checks for API keys can leak information about the key via response time variations.
**Prevention:** Always apply `helmet()` and `cors()` in Express apps. Use `crypto.timingSafeEqual` for all secret/key comparisons. Enforce strict input validation using schemas (e.g., Zod) and apply input length limits to mitigate DoS risks.
