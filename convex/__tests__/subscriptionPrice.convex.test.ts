import { describe, expect, test } from "vitest";
import {
  DEFAULT_MONTHLY_PRICE_LABEL,
  normalizeMonthlyPriceLabel,
} from "../lib/subscriptionPrice";

describe("subscription price labels", () => {
  test("preserves a complete configured label", () => {
    expect(normalizeMonthlyPriceLabel("€8.99/month")).toBe("€8.99/month");
  });

  test("repairs the shell-expanded price shown in settings", () => {
    expect(normalizeMonthlyPriceLabel(".99/month")).toBe(
      DEFAULT_MONTHLY_PRICE_LABEL,
    );
  });

  test("uses the product default when configuration is empty", () => {
    expect(normalizeMonthlyPriceLabel(undefined)).toBe(
      DEFAULT_MONTHLY_PRICE_LABEL,
    );
  });
});
