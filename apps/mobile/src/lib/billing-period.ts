import { uiLocale } from "@repo/ui/i18n"

/** The native bridge returns canonical period units; localize only their display. */
export function billingPeriodLabel(period: string): string {
  const match = /^(?:(\d+) )?(day|week|month|year)s?$/.exec(period)
  if (!match) return period
  const format = new Intl.NumberFormat(uiLocale(), {
    style: "unit",
    unit: match[2],
    unitDisplay: "long",
  })
  return match[1]
    ? format.format(Number(match[1]))
    : format.formatToParts(1).find((part) => part.type === "unit")?.value ?? period
}
