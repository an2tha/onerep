export const DEFAULT_MONTHLY_PRICE_LABEL = "$9.99/month";

export function normalizeMonthlyPriceLabel(value: string | undefined) {
  const configured = value?.trim();
  // An unquoted "$9.99/month" is commonly shell-expanded to ".99/month".
  return configured && !/^\.\d{2}\//.test(configured)
    ? configured
    : DEFAULT_MONTHLY_PRICE_LABEL;
}
