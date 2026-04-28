## 2025-05-14 - API Key Timing Attacks and Input Validation
**Vulnerability:** The Data API lacked authentication on `/api/v1` routes and did not validate user-provided search queries or IDs, leading to potential unauthorized access and DoS/SQL injection risks.
**Learning:** Even internal or "legacy" APIs need baseline security (Auth + Validation). Using `crypto.timingSafeEqual` is the standard for secret comparison to prevent side-channel attacks.
**Prevention:** Always apply authentication middleware and use Zod (or similar) to strictly validate all external inputs before they reach database queries.
