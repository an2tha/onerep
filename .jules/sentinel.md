## 2025-05-14 - Timing-Safe API Key Validation
**Vulnerability:** Timing attacks on API key comparisons and potential length-mismatch crashes/leaks when using `crypto.timingSafeEqual` on raw input.
**Learning:** `crypto.timingSafeEqual` requires both buffers to have the same length. Comparing a user-provided API key directly to a stored secret can fail if lengths differ or leak length information via timing.
**Prevention:** Always hash both the provided API key and the expected key using a fixed-length algorithm (like SHA-256) before performing a timing-safe comparison. This ensures both buffers are the same length and protects against timing attacks regardless of the original input length.
