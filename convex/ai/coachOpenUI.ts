import { createParser } from "@openuidev/lang-core";
import { coachOpenUISchema } from "./coachOpenUI.generated";

const parser = createParser(coachOpenUISchema, "Stack");

/** Validate the actual OpenUI program before accepting any operations in a turn. */
export function normalizeCoachOpenUI(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 48000) {
    throw new Error("Invalid Coach OpenUI response");
  }
  const source = value.trim();
  if (!source) return "";
  const result = parser.parse(source);
  if (
    !result.root ||
    result.meta.incomplete ||
    result.meta.unresolved.length ||
    result.meta.errors.length ||
    result.queryStatements.length ||
    result.mutationStatements.length
  ) {
    throw new Error(
      "Coach returned an incomplete or unsupported OpenUI interface",
    );
  }
  return source;
}
