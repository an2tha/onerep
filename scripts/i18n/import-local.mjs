import fs from "node:fs";
import { languages } from "./catalog.mjs";
const paths = process.argv.slice(2);
if (!paths.length)
  throw new Error("Pass one or more translation results.jsonl files");
const catalogues = Object.fromEntries(
  languages.map((language) => [
    language,
    JSON.parse(
      fs.readFileSync(`packages/ui/src/locales/${language}.json`, "utf8"),
    ),
  ]),
);
const tokens = (text) =>
  [...text.matchAll(/\{\{\w+\}\}/g)]
    .map((match) => match[0])
    .sort()
    .join("|");
let imported = 0;
for (const path of paths) {
  const data = fs.readFileSync(path, "utf8");
  const lines = data.split("\n");
  if (!data.endsWith("\n")) lines.pop();
  for (const line of lines.filter(Boolean)) {
    const { language, source, translation } = JSON.parse(line);
    if (
      !languages.includes(language) ||
      language === "en" ||
      !translation?.trim() ||
      tokens(source) !== tokens(translation)
    )
      throw new Error(`Invalid translation in ${path}`);
    catalogues[language][source] = translation;
    imported++;
  }
}
for (const language of languages)
  fs.writeFileSync(
    `packages/ui/src/locales/${language}.json`,
    JSON.stringify(catalogues[language], null, 2) + "\n",
  );
console.log(`Imported ${imported} validated local translations`);
