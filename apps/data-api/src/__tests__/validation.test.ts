import { describe, it, expect } from "bun:test";
import { searchQuerySchema, barcodeSchema, idParamSchema } from "../../lib/validation";

describe("Validation Schemas", () => {
  describe("searchQuerySchema", () => {
    it("should validate a valid search query", () => {
      const data = { q: "apple", limit: "10" };
      const result = searchQuerySchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.q).toBe("apple");
        expect(result.data.limit).toBe(10);
      }
    });

    it("should validate a query with grade", () => {
      const data = { q: "apple", grade: "a" };
      const result = searchQuerySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("should reject an invalid grade", () => {
      const data = { grade: "z" };
      const result = searchQuerySchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("should coerce limit to number", () => {
      const data = { limit: "25" };
      const result = searchQuerySchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
      }
    });
  });

  describe("barcodeSchema", () => {
    it("should validate a numeric barcode", () => {
      const data = { code: "123456789" };
      const result = barcodeSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("should reject a non-numeric barcode", () => {
      const data = { code: "abc123" };
      const result = barcodeSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe("idParamSchema", () => {
    it("should validate a numeric string ID", () => {
      const data = { id: "123" };
      const result = idParamSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("should validate an alphanumeric string ID", () => {
      const data = { id: "e1" };
      const result = idParamSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("should reject an empty ID", () => {
      const data = { id: "" };
      const result = idParamSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});
