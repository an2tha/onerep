## 2025-05-02 - [API Key Authentication for Data API]
**Vulnerability:** The `apps/data-api` Express server lacked any authentication, exposing sensitive fitness and nutrition data datasets and internal PostgreSQL/DuckDB query capabilities to anyone with network access.
**Learning:** Legacy or internal APIs often lack security boundaries that are taken for granted in the main application. Even if an API is intended for internal use by a backend (like Convex), it must still implement defense-in-depth measures.
**Prevention:** Always implement mandatory authentication (e.g., API key with timing-safe comparison) for all service-to-service communication. Use middleware to enforce these checks globally or on specific route groups.
