import { readFileSync as readRawFileSync } from "node:fs"
import ts from "typescript"

/**
 * Source contracts check structure and behavior independently of translation syntax.
 * Reconstruct the English expression represented by tr/Message without evaluating it.
 * Runtime localization and catalogue completeness have separate tests.
 */
export function englishSource(code: string): string {
  const source = ts.createSourceFile(
    "contract.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const properties = (node: ts.Node | undefined) =>
    node && ts.isObjectLiteralExpression(node)
      ? new Map(
          node.properties
            .filter(ts.isPropertyAssignment)
            .map((p) => [p.name.getText(source), p.initializer])
        )
      : new Map<string, ts.Expression>()
  function render(node: ts.Node): string {
    if (ts.isConditionalExpression(node)) {
      return `${render(node.condition)} ? ${render(node.whenTrue)} : ${render(node.whenFalse)}`
    }
    if (
      ts.isJsxElement(node) &&
      node.children.some(
        (child) =>
          (ts.isJsxSelfClosingElement(child) &&
            child.tagName.getText(source) === "Message") ||
          (ts.isJsxExpression(child) &&
            child.expression &&
            ts.isCallExpression(child.expression) &&
            child.expression.expression.getText(source) === "tr")
      )
    ) {
      const content = node.children
        .filter((child) => !ts.isJsxText(child) || child.text.trim())
        .map(render)
        .join("")
      return render(node.openingElement) + content + render(node.closingElement)
    }
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      !ts.isJsxAttribute(node.parent)
    ) {
      const value = render(node.expression)
      if (/^"(?:[^"\\]|\\.)*"$/.test(value)) return JSON.parse(value)
    }
    if (
      ts.isCallExpression(node) &&
      ["translateError", "choice"].includes(node.expression.getText(source)) &&
      node.arguments[0]
    )
      return render(node.arguments[0])
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "tr" &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const text = node.arguments[0].text
      const values = properties(node.arguments[1])
      if (!values.size) return JSON.stringify(text)
      return (
        "`" +
        text
          .replace(/`/g, "\\`")
          .replace(/\{\{(\w+)\}\}/g, (match, key) =>
            values.has(key) ? "${" + render(values.get(key)!) + "}" : match
          ) +
        "`"
      )
    }
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(source) === "Message"
    ) {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute)
      const text = attrs.find(
        (a) => a.name.getText(source) === "text"
      )?.initializer
      const valueAttr = attrs.find(
        (a) => a.name.getText(source) === "values"
      )?.initializer
      const values = properties(
        valueAttr && ts.isJsxExpression(valueAttr)
          ? valueAttr.expression
          : undefined
      )
      if (
        text &&
        ts.isJsxExpression(text) &&
        text.expression &&
        ts.isStringLiteralLike(text.expression)
      ) {
        return text.expression.text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
          const value = values.get(key)
          return value
            ? ts.isJsxElement(value) || ts.isJsxSelfClosingElement(value)
              ? render(value)
              : `{${render(value)}}`
            : match
        })
      }
    }
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression
    ) {
      const value = render(node.initializer.expression)
      if (/^"(?:[^"\\]|\\.)*"$/.test(value))
        return `${node.name.getText(source)}=${value}`
      return `${node.name.getText(source)}={${value}}`
    }
    let result = node.getText(source)
    const start = node.getStart(source)
    const children: ts.Node[] = []
    ts.forEachChild(node, (child) => {
      children.push(child)
    })
    for (const child of children.reverse())
      result =
        result.slice(0, child.getStart(source) - start) +
        render(child) +
        result.slice(child.end - start)
    if (
      ts.isCallExpression(node) &&
      /^(?:toast\.[a-z]+|navigate|foodLogContextParams)$/.test(
        node.expression.getText(source)
      )
    ) {
      result = result.replace(/\(\s*\n\s*/g, "(").replace(/\s*\n\s*\)/g, ")")
    }
    return result
  }
  return render(source)
}

export const readLocalizedSource: typeof readRawFileSync = ((
  ...args: Parameters<typeof readRawFileSync>
) => {
  const value = readRawFileSync(...args)
  return typeof value === "string" && value.includes('from "@repo/ui/i18n"')
    ? englishSource(value)
    : value
}) as typeof readRawFileSync
