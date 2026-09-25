import fs from "node:fs";
import { collectMessages, languages } from "./catalog.mjs";
const sources = [
  ...new Set(collectMessages().map((message) => message.text)),
].sort();
const reviewed = JSON.parse(
  fs.readFileSync("scripts/i18n/reviewed.json", "utf8"),
);
for (const language of languages) {
  const file = `packages/ui/src/locales/${language}.json`;
  const existing = JSON.parse(fs.readFileSync(file, "utf8"));
  const catalogue = Object.fromEntries(
    sources.map((source) => [
      source,
      language === "en"
        ? source
        : (reviewed[language]?.[source] ?? existing[source]),
    ]),
  );
  const missing = sources.filter((source) => !catalogue[source]);
  if (missing.length)
    throw new Error(
      `${language}: ${missing.length} untranslated messages remain`,
    );
  fs.writeFileSync(file, JSON.stringify(catalogue, null, 2) + "\n");
}
console.log(
  `Applied reviewed translations and retained ${sources.length} active messages per language`,
);
