import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const languages = ["en", "de", "es", "fr", "it", "pt"];
export function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
}
export function collectMessages() {
  const entries = [];
  for (const file of ["apps/mobile/src", "packages/ui/src"]
    .flatMap(walk)
    .filter(
      (f) => /\.tsx?$/.test(f) && !/\.test\.|\.legacy\.|\/i18n\//.test(f),
    )) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function add(text, values) {
      let variants = [text];
      if (values && ts.isObjectLiteralExpression(values))
        for (const prop of values.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key = prop.name.getText(source);
          const expression = prop.initializer.getText(source);
          if (
            ts.isCallExpression(prop.initializer) &&
            prop.initializer.expression.getText(source) === "choice"
          ) {
            const choices = [];
            function leaves(node) {
              if (ts.isStringLiteralLike(node)) choices.push(node.text);
              else if (ts.isConditionalExpression(node)) {
                leaves(node.whenTrue);
                leaves(node.whenFalse);
              }
            }
            leaves(prop.initializer.arguments[0]);
            variants = variants.flatMap((v) =>
              [...new Set(choices)].map((choice) =>
                v.replaceAll(`{{${key}}}`, choice),
              ),
            );
            continue;
          }
          if (!/\?[^\n]*["']s["']/.test(expression)) continue;
          const token = `{{${key}}}`;
          if (!new RegExp(`[A-Za-z]\\{\\{${key}\\}\\}`).test(text)) continue;
          variants = variants.flatMap((v) => [
            v.replaceAll(token, ""),
            v.replaceAll(token, "s"),
          ]);
        }
      entries.push(...variants.map((text) => ({ file, text })));
    }
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "tr" &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      )
        add(node.arguments[0].text, node.arguments[1]);
      if (
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        node.tagName.getText(source) === "Message"
      ) {
        const attrs = node.attributes.properties;
        const text = attrs.find(
          (a) => a.name?.getText(source) === "text",
        )?.initializer;
        const values = attrs.find(
          (a) => a.name?.getText(source) === "values",
        )?.initializer;
        if (
          text &&
          ts.isJsxExpression(text) &&
          text.expression &&
          ts.isStringLiteralLike(text.expression)
        )
          add(text.expression.text, values?.expression);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const extra = "scripts/i18n/additional-messages.json";
  if (fs.existsSync(extra))
    entries.push(
      ...JSON.parse(fs.readFileSync(extra, "utf8")).map((text) => ({
        file: "Built-in labels and native interface",
        text,
      })),
    );
  return entries;
}
if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  const messages = collectMessages();
  const sources = [...new Set(messages.map((m) => m.text))].sort();
  if (process.argv.includes("--check")) {
    const errors = [];
    const tokens = (s) =>
      [...s.matchAll(/\{\{\w+\}\}/g)]
        .map((m) => m[0])
        .sort()
        .join("|");
    for (const lang of languages) {
      const catalog = JSON.parse(
        fs.readFileSync(`packages/ui/src/locales/${lang}.json`, "utf8"),
      );
      for (const source of sources) {
        if (!catalog[source]?.trim()) errors.push(`${lang}: missing ${source}`);
        else if (tokens(source) !== tokens(catalog[source]))
          errors.push(`${lang}: placeholders differ: ${source}`);
      }
    }
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else
      console.log(
        `${sources.length} messages verified in all ${languages.length} languages`,
      );
  } else {
    fs.mkdirSync(".cache/i18n", { recursive: true });
    fs.writeFileSync(
      ".cache/i18n/messages.json",
      JSON.stringify(messages, null, 2) + "\n",
    );
    fs.writeFileSync(
      "packages/ui/src/locales/en.json",
      JSON.stringify(Object.fromEntries(sources.map((s) => [s, s])), null, 2) +
        "\n",
    );
    console.log(`${sources.length} messages collected`);
  }
}
