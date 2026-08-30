/**
 * OTA master switch, isolated in its own module so the test suite can alias
 * it with mock.module() and re-enable the flow without touching production
 * code. See src/lib/ota.ts for the full rationale (Apple guideline 2.7.2).
 */
export const OTA_ENABLED = false
