import { describe, test, expect } from "bun:test";
import { cn } from "../utils";

describe("cn (packages/ui)", () => {
  test("returns single class unchanged", () => {
    expect(cn("flex")).toBe("flex");
  });

  test("joins multiple classes", () => {
    const result = cn("flex", "items-center", "gap-2");
    expect(result).toBe("flex items-center gap-2");
  });

  test("resolves Tailwind conflicts: later wins", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  test("handles conditional classes via boolean", () => {
    const isActive = true;
    const result = cn("base", isActive && "active");
    expect(result).toContain("base");
    expect(result).toContain("active");
  });

  test("omits falsy conditional classes", () => {
    const isActive = false;
    const result = cn("base", isActive && "active");
    expect(result).toBe("base");
  });

  test("handles object syntax for conditional classes", () => {
    const result = cn({
      "text-primary": true,
      "text-muted": false,
      "font-semibold": true,
    });
    expect(result).toContain("text-primary");
    expect(result).toContain("font-semibold");
    expect(result).not.toContain("text-muted");
  });

  test("handles array input", () => {
    const classes = ["flex", "justify-center"];
    expect(cn(classes)).toBe("flex justify-center");
  });

  test("handles mixed input types", () => {
    const result = cn(
      "base-class",
      ["arr-class"],
      { "obj-class": true },
      false && "skip-this",
      undefined
    );
    expect(result).toContain("base-class");
    expect(result).toContain("arr-class");
    expect(result).toContain("obj-class");
    expect(result).not.toContain("skip-this");
  });

  test("deduplicates conflicting margins", () => {
    const result = cn("m-2", "m-4");
    expect(result).toBe("m-4");
  });

  test("preserves non-conflicting utility classes", () => {
    const result = cn("flex", "flex-col", "w-full", "h-screen");
    expect(result).toContain("flex");
    expect(result).toContain("flex-col");
    expect(result).toContain("w-full");
    expect(result).toContain("h-screen");
  });

  test("empty call returns empty string", () => {
    expect(cn()).toBe("");
  });

  test("all-falsy args return empty string", () => {
    expect(cn(undefined, false as any, null as any)).toBe("");
  });

  test("real-world shadcn pattern: variant merging", () => {
    // Simulate shadcn button variant merging
    const base = "inline-flex items-center rounded-md";
    const variant = "bg-primary text-primary-foreground";
    const override = "bg-destructive"; // overrides bg-primary
    const result = cn(base, variant, override);
    expect(result).not.toContain("bg-primary");
    expect(result).toContain("bg-destructive");
    expect(result).toContain("text-primary-foreground");
  });
});
