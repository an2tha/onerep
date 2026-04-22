## 2025-05-15 - Input Validation and Secure Error Handling in Data API
**Vulnerability:** Information leakage through detailed 500 error responses and potential DoS via unvalidated search query lengths.
**Learning:** Raw error messages in Express can expose stack traces or DB internals. Lack of input length limits on search parameters can lead to ReDoS or DoS.
**Prevention:** Use generic error messages for server-side failures (>= 500). Always enforce maximum length limits on user-provided search strings and validate batch ID inputs against a strict schema.
