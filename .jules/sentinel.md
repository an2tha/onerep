## 2025-05-22 - [Exposed Data API and Missing Security Headers]
**Vulnerability:** The Express-based Data API (`apps/data-api`) had all `/api/v1` routes exposed to the public without any authentication, and was missing standard security headers (e.g., CSP, X-Frame-Options).
**Learning:** Legacy or internal utility APIs often bypass the primary authentication layer (like Better Auth in the mobile app) and can be forgotten, leaving sensitive data vulnerable to scraping or unauthorized access if not explicitly protected.
**Prevention:** Always implement a baseline security middleware stack (like `helmet`) and enforce authentication (e.g., API keys with timing-safe comparison) for all API routes from the start, even for "internal" or "legacy" components.
