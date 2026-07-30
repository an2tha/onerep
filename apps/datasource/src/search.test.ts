import { expect, test } from "bun:test";
import { nameKey, searchParams, toMatchExpression } from "./search.ts";

test("builds an AND query with a prefix on the last token", () => {
  expect(toMatchExpression("chicken breast")).toBe('"chicken" AND "breast"*');
});

test("returns null for input with no usable tokens", () => {
  expect(toMatchExpression("   ")).toBeNull();
  expect(toMatchExpression("!!!")).toBeNull();
});

test("neutralises FTS5 operators typed by the user", () => {
  expect(toMatchExpression("milk OR beer")).toBe('"milk" AND "or" AND "beer"*');
  expect(toMatchExpression('cheese" OR "x')).toBe('"cheese" AND "or" AND "x"*');
  expect(toMatchExpression("a NEAR(b)")).toBe('"a" AND "near" AND "b"*');
});

test("keeps digits and accented letters", () => {
  expect(toMatchExpression("2% crème")).toBe('"2" AND "crème"*');
});

test("normalises comma-inverted USDA names to the typed phrase", () => {
  expect(nameKey("Chicken, breast, raw")).toBe("chicken breast raw");
  expect(nameKey("chicken breast")).toBe("chicken breast");
});

test("strips LIKE wildcards from the prefix bonus", () => {
  expect(searchParams("100% juice", 10)?.[":prefix"]).toBe("100 juice%");
  expect(searchParams("a_b", 10)?.[":raw"]).toBe("a b");
});

test("returns null params when nothing is searchable", () => {
  expect(searchParams("  ", 10)).toBeNull();
});
