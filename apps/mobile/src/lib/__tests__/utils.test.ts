import { describe, test, expect } from "bun:test";
import { cn } from "../utils";

describe("cn (class name utility)", () => {
  test("returns a single class name unchanged", () => {
    expect(cn("text-red-500")).toBe("text-red-500");
  });

  test("merges multiple class names", () => {
    const result = cn("text-red-500", "font-bold");
    expect(result).toContain("text-red-500");
    expect(result).toContain("font-bold");
  });

  test("handles undefined and null values", () => {
    expect(() => cn("text-red-500", undefined, null as any)).not.toThrow();
  });

  test("handles false conditionals", () => {
    const result = cn("base-class", false && "conditional-class");
    expect(result).toContain("base-class");
    expect(result).not.toContain("conditional-class");
  });

  test("handles true conditionals", () => {
    const result = cn("base-class", true && "conditional-class");
    expect(result).toContain("base-class");
    expect(result).toContain("conditional-class");
  });

  test("handles object syntax", () => {
    const result = cn({ "text-red-500": true, "text-blue-500": false });
    expect(result).toContain("text-red-500");
    expect(result).not.toContain("text-blue-500");
  });

  test("handles array syntax", () => {
    const result = cn(["text-red-500", "font-bold"]);
    expect(result).toContain("text-red-500");
    expect(result).toContain("font-bold");
  });

  test("merges conflicting Tailwind classes (twMerge behavior)", () => {
    // twMerge should resolve conflicts: later class wins
    const result = cn("text-red-500", "text-blue-500");
    expect(result).not.toContain("text-red-500");
    expect(result).toContain("text-blue-500");
  });

  test("merges conflicting padding classes", () => {
    const result = cn("p-4", "p-2");
    expect(result).toBe("p-2");
  });

  test("preserves non-conflicting classes", () => {
    const result = cn("p-4", "m-2", "text-red-500");
    expect(result).toContain("p-4");
    expect(result).toContain("m-2");
    expect(result).toContain("text-red-500");
  });

  test("returns empty string for no arguments", () => {
    expect(cn()).toBe("");
  });

  test("returns empty string for all falsy arguments", () => {
    expect(cn(false as any, null as any, undefined)).toBe("");
  });

  test("handles nested arrays and objects", () => {
    const result = cn(["text-sm", { "font-bold": true }], "mt-2");
    expect(result).toContain("text-sm");
    expect(result).toContain("font-bold");
    expect(result).toContain("mt-2");
  });
});
