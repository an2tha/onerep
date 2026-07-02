type ClerkErrorLike = {
  code?: unknown
  longMessage?: unknown
  message?: unknown
  errors?: unknown
}

function collectErrorStrings(error: unknown, strings: string[] = []) {
  if (!error) return strings

  if (typeof error === "string") {
    strings.push(error)
    return strings
  }

  if (error instanceof Error) {
    strings.push(error.message)
    strings.push(error.name)
  }

  if (typeof error !== "object") {
    strings.push(String(error))
    return strings
  }

  const maybeError = error as ClerkErrorLike
  for (const value of [
    maybeError.code,
    maybeError.longMessage,
    maybeError.message,
  ]) {
    if (typeof value === "string" && value.length > 0) {
      strings.push(value)
    }
  }

  if (Array.isArray(maybeError.errors)) {
    for (const nested of maybeError.errors) {
      collectErrorStrings(nested, strings)
    }
  }

  return strings
}

export function isAlreadySignedInError(error: unknown) {
  return collectErrorStrings(error).some((value) => {
    const normalized = value.toLowerCase().replace(/[_-]+/g, " ")
    return /\balready\s+signed\s+in\b/.test(normalized)
  })
}
