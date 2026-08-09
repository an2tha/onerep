/**
 * 1RM estimation.
 *
 * The formulas moved to `@repo/models/one-rm` once the coach started reasoning
 * about estimated maxes server-side: a backend that computed a lift's e1RM
 * slightly differently from the chart on this screen would be confidently
 * contradicting the app. This file stays as the app's import path.
 */

export {
  brzycki1RM,
  epley1RM,
  estimate1RM,
  orm1RMBreakdown,
} from "@repo/models/one-rm"
