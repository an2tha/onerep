## 2025-05-14 - [Timing Attack Prevention & API Key Validation]
**Vulnerability:** API key comparison was previously missing or using insecure string comparison, and the `/api/v1` routes were unprotected.
**Learning:** Even internal APIs should enforce authentication and use timing-safe comparisons to prevent data leakage or unauthorized access.
**Prevention:** Use `crypto.timingSafeEqual` for all secret/key comparisons and ensure all sensitive endpoints are protected by an authentication middleware.
