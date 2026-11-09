import { operations } from "../../../../../packages/sdk/src/operations"
import { productionOrigin } from "../../../../../packages/sdk/src/index"
import { resolveConvexSiteUrl } from "../../lib/service-urls"
import examples from "./examples.json"

export type Operation = (typeof operations)[number]
type Example = {
  path: string
  input: Record<string, unknown>
  body?: unknown
  response: unknown
}
export const referenceExamples: Record<Operation["operation"], Example> =
  examples
const origin =
  resolveConvexSiteUrl(
    import.meta.env.VITE_CONVEX_SITE_URL,
    import.meta.env.VITE_CONVEX_URL,
  ) || productionOrigin

function shellQuote(value: string) {
  return "'" + value.replaceAll("'", "'\\''") + "'"
}

export function requestExample(operation: Operation, language: "curl" | "sdk") {
  const example = referenceExamples[operation.operation]
  const variable =
    operation.scope === "delete" ? "ONEREP_DELETE_KEY" : "ONEREP_ACCESS_TOKEN"
  if (language === "curl") {
    const parts = [
      `curl --fail-with-body --request ${operation.method} ${shellQuote(new URL(example.path, origin).href)}`,
      `--header "Authorization: Bearer $${variable}"`,
    ]
    if (example.body !== undefined) {
      parts.push(
        "--header 'Content-Type: application/json'",
        "--data " + shellQuote(JSON.stringify(example.body, null, 2)),
      )
    }
    return parts.join(" \\\n  ")
  }

  const args = Object.keys(example.input).length
    ? ", " + JSON.stringify(example.input, null, 2)
    : ""
  const originOption =
    origin === productionOrigin ? "" : `, origin: ${JSON.stringify(origin)}`
  return `import { OneRep } from "@onerep/sdk";

const accessToken = process.env.${variable};
if (!accessToken) throw new Error("Set ${variable}");

const api = new OneRep({ accessToken${originOption} });
const result = await api.call("${operation.operation}"${args});
console.log(result);`
}
