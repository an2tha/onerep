import fs from "node:fs";
import { languages } from "./catalog.mjs";
const native = JSON.parse(
  fs.readFileSync("scripts/i18n/native-messages.json", "utf8"),
);
const catalogues = Object.fromEntries(
  languages.map((lang) => [
    lang,
    JSON.parse(fs.readFileSync(`packages/ui/src/locales/${lang}.json`, "utf8")),
  ]),
);
function catalog(entries, info = false) {
  const strings = {};
  for (const [key, source] of Object.entries(entries)) {
    const formats = info
      ? []
      : (key.match(/%(?:\d+\$)?(?:lld|ld|d|@|f)/g) ?? []);
    const localizations = {};
    for (const lang of languages) {
      let value = catalogues[lang][source];
      if (!value)
        throw new Error(`Missing ${lang} native translation: ${source}`);
      value = value.replace(/\{\{value(\d+)\}\}/g, (_, index) => {
        const format = formats[Number(index)];
        if (!format) throw new Error(`Missing native format: ${key}`);
        return `%${Number(index) + 1}$${format.slice(1)}`;
      });
      localizations[lang] = { stringUnit: { state: "translated", value } };
    }
    strings[key] = { extractionState: "manual", localizations };
  }
  return (
    JSON.stringify({ sourceLanguage: "en", strings, version: "1.0" }, null, 2) +
    "\n"
  );
}
for (const target of ["App", "OneRep", "OneRepWatch"])
  fs.writeFileSync(
    `apps/mobile/ios/App/${target}/Localizable.xcstrings`,
    catalog(native.strings),
  );
for (const [target, messages] of Object.entries(native.permissions))
  if (Object.keys(messages).length)
    fs.writeFileSync(
      `apps/mobile/ios/App/${target}/InfoPlist.xcstrings`,
      catalog(messages, true),
    );
function xml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "\\'")
    .replaceAll('"', '\\"');
}
for (const language of languages.filter((language) => language !== "en")) {
  const lines = [];
  for (const [key, format] of Object.entries(native.android ?? {})) {
    const source = format.replace(
      /%(\d+)\$[sd]/g,
      (_, position) => `{{value${Number(position) - 1}}}`,
    );
    const translated = catalogues[language][source];
    if (!translated)
      throw new Error(`Missing ${language} Android translation: ${source}`);
    const formats = [...format.matchAll(/%(\d+)\$[sd]/g)];
    const value = translated.replace(
      /\{\{value(\d+)\}\}/g,
      (_, index) =>
        formats.find((match) => Number(match[1]) === Number(index) + 1)?.[0] ??
        "",
    );
    lines.push(`    <string name="${key}">${xml(value)}</string>`);
  }
  const directory = `apps/mobile/android/app/src/main/res/values-${language}`;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    `${directory}/strings.xml`,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${lines.join("\n")}\n</resources>\n`,
  );
}
console.log("Updated iOS, Android, widget and watch translations");
