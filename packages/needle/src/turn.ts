import type { NeedleCall, NeedleTurn } from "./types.ts";

/**
 * Reads the engine's JSON into our shape.
 *
 * Written defensively rather than with a schema validator, because the one
 * thing this parser must never do is throw. The engine writes into a fixed
 * output buffer; a report that overruns it arrives truncated, and a truncated
 * turn is a recoverable "the model said nothing usable" — the loop can retry or
 * escalate. A parse exception here would instead take down whatever screen
 * asked, over a string.
 */
export function parseTurn(raw: string): NeedleTurn {
  const trimmed = raw.trim();
  if (!trimmed) return failed("needle returned an empty turn", "empty");
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return failed(
      `needle returned unparseable JSON: ${trimmed.slice(0, 200)}`,
      "malformed",
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failed("needle returned a non-object turn", "malformed");
  }
  const record = value as Record<string, unknown>;
  return {
    type: record.type === "respond" ? "respond" : "call",
    success: record.success !== false,
    error: text(record.error),
    errorCode: text(record.error_code ?? record.errorCode),
    calls: calls(record.function_calls ?? record.functionCalls),
    reasoning: text(record.reasoning),
    confidence: number(record.confidence),
    prefillTps: number(record.prefill_tps ?? record.prefillTps),
    decodeTps: number(record.decode_tps ?? record.decodeTps),
    peakRamMb: number(record.peak_ram_mb ?? record.peakRamMb),
  };
}

function failed(message: string, code: string): NeedleTurn {
  return {
    type: "respond",
    success: false,
    error: message,
    errorCode: code,
    calls: [],
    reasoning: null,
    confidence: null,
    prefillTps: null,
    decodeTps: null,
    peakRamMb: null,
  };
}

function calls(value: unknown): NeedleCall[] {
  if (!Array.isArray(value)) return [];
  const out: NeedleCall[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string" || !record.name) continue;
    const args = record.arguments;
    out.push({
      name: record.name,
      arguments:
        args && typeof args === "object" && !Array.isArray(args)
          ? (args as Record<string, unknown>)
          : {},
    });
  }
  return out;
}

function text(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
