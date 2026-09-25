// Draft catalogues through the project's configured provider, then validate them.
// This is a stateless translation request with no tools or access to app data.
import fs from "node:fs";

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL;
if (!apiKey || !model?.startsWith("openai/"))
  throw new Error("Set OPENROUTER_API_KEY and an approved OPENROUTER_MODEL");

const entries = JSON.parse(
  fs.readFileSync(".cache/i18n/messages.json", "utf8"),
);
const sources = [...new Set(entries.map((e) => e.text))].sort();
const context = new Map(
  sources.map((source) => [
    source,
    [
      ...new Set(entries.filter((e) => e.text === source).map((e) => e.file)),
    ].slice(0, 3),
  ]),
);
const languages = {
  de: "German (Germany), informal du",
  es: "Spanish, informal tú",
  fr: "French, polite vous",
  it: "Italian, informal tu",
  pt: "European Portuguese, informal tu",
};
const tokens = (text) =>
  [...text.matchAll(/\{\{\w+\}\}/g)]
    .map((m) => m[0])
    .sort()
    .join("|");
fs.writeFileSync(
  "packages/ui/src/locales/en.json",
  JSON.stringify(
    Object.fromEntries(sources.map((source) => [source, source])),
    null,
    2,
  ) + "\n",
);

async function translate(language, batch) {
  const properties = Object.fromEntries(
    batch.map((_, i) => [`m${i}`, { type: "string" }]),
  );
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(180000),
      body: JSON.stringify({
        model,
        provider: {
          only: ["azure"],
          allow_fallbacks: false,
          data_collection: "deny",
          zdr: true,
        },
        messages: [
          {
            role: "system",
            content: `Translate the supplied OneRep fitness app interface strings into ${languages[language]}. Return only the requested JSON object. Write natural, accurate product UI, never summaries. Preserve every {{value0}} style placeholder exactly, including duplicates; placeholders may contain names, numbers, icons, links or controls and may be reordered. Preserve technical units, named brands (OneRep, Apple Health, App Store, TestFlight, Health Connect, OpenRouter), URLs, API and MCP. Translate all ordinary language, including accessibility labels, errors, workout and nutrition terminology. Workout sets are training sets, reps are repetitions, routines are exercise plans. Use consistent terminology and appropriate grammar. Do not add claims or change billing, privacy, health or permission meanings. Avoid em dashes. Keep leading/trailing whitespace exactly as supplied. Short labels should remain concise. File paths are context only and must not appear in output.`,
          },
          {
            role: "user",
            content: JSON.stringify(
              batch.map((text, i) => ({
                id: `m${i}`,
                text,
                requiredPlaceholders: text.match(/\{\{\w+\}\}/g) ?? [],
                context: context.get(text),
              })),
            ),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "translations",
            strict: true,
            schema: {
              type: "object",
              properties,
              required: Object.keys(properties),
              additionalProperties: false,
            },
          },
        },
        max_tokens: 16000,
      }),
    },
  );
  const body = await response.json();
  if (!response.ok || body.error)
    throw Object.assign(
      new Error(
        `Translation request failed: ${response.status} ${body.error?.message ?? ""}`,
      ),
      { status: response.status },
    );
  if (body.choices?.[0]?.finish_reason === "length")
    throw new Error("Translation response was truncated");
  const translated = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
  return Object.fromEntries(
    batch.flatMap((source, i) => {
      const value = translated[`m${i}`];
      if (
        typeof value !== "string" ||
        !value.trim() ||
        tokens(value) !== tokens(source)
      )
        return [];
      const prefix = /^\s*/.exec(source)[0];
      const suffix = /\s*$/.exec(source)[0];
      return [
        [source, prefix + value.trim().replace(/\s*—\s*/g, ", ") + suffix],
      ];
    }),
  );
}

const jobs = [];
const catalogues = {};
for (const language of Object.keys(languages)) {
  const file = `packages/ui/src/locales/${language}.json`;
  catalogues[language] = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const source of sources)
    if (!/[A-Za-z]/.test(source.replace(/\{\{\w+\}\}/g, "")))
      catalogues[language][source] = source;
  const missing = sources.filter((source) => !catalogues[language][source]);
  for (let start = 0; start < missing.length; start += 80)
    jobs.push({ language, batch: missing.slice(start, start + 80) });
}
console.log(`Drafting ${jobs.length} batches using ${model}`);
let finished = 0;
async function worker() {
  while (jobs.length) {
    const { language, batch, retry = 0 } = jobs.shift();
    let result;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        result = await translate(language, batch);
        break;
      } catch (error) {
        console.error(`${language}: ${error.message}`);
        if (attempt === 9 || [401, 402, 403].includes(error.status))
          throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(30000, 2000 * 2 ** attempt)),
        );
      }
    }
    Object.assign(catalogues[language], result);
    const missing = batch.filter((source) => !result[source]);
    if (missing.length) {
      if (retry >= 4)
        throw new Error(
          `Could not validate ${language}: ${missing.join(", ")}`,
        );
      for (const source of missing)
        jobs.push({ language, batch: [source], retry: retry + 1 });
    }
    const sorted = Object.fromEntries(
      Object.entries(catalogues[language]).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
    fs.writeFileSync(
      `packages/ui/src/locales/${language}.json`,
      JSON.stringify(sorted, null, 2) + "\n",
    );
    console.log(
      `${language}: ${Object.keys(sorted).length}/${sources.length} translated (${++finished} batches complete)`,
    );
  }
}
await Promise.all(Array.from({ length: 2 }, worker));
