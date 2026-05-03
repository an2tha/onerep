## 2025-05-15 - Missing Authentication on Data API
**Vulnerability:** The `data-api` Express application had no authentication mechanism, exposing fitness and nutrition datasets to unauthorized access.
**Learning:** Legacy components or internal microservices are often overlooked during security hardening, especially when they appear to be "internal" but are exposed via HTTP.
**Prevention:** Always implement at least a basic API key authentication (with timing-safe comparison) for all service-to-service communication. Ensure environment variables for secrets are documented in `.env.example`.
