export type MatchableDetection = {
  name: string;
  searchQueries?: string[];
};

export type MatchableFood = {
  id?: string;
  code?: string;
  name: string;
  brand?: string;
  openFoodFacts?: Record<string, unknown>;
};

const STOP_TOKENS = new Set([
  "and",
  "or",
  "with",
  "without",
  "the",
  "a",
  "an",
  "of",
  "for",
  "in",
  "on",
  "to",
  "from",
  "by",
  "per",
  "cooked",
  "raw",
  "fresh",
  "grilled",
  "baked",
  "fried",
  "boiled",
  "steamed",
  "roasted",
  "sauteed",
  "sautéed",
  "spiced",
  "seasoned",
  "sliced",
  "diced",
  "chopped",
  "small",
  "large",
  "medium",
  "piece",
  "pieces",
  "portion",
  "serving",
  "side",
  "bowl",
  "plate",
  "food",
  "meal",
  "dish",
  "ingredient",
  "homemade",
  "prepared",
  "generic",
  "plain",
  "filling",
]);

const WEAK_SINGLE_TOKEN_QUERIES = new Set([
  "batter",
  "sauce",
  "paste",
  "mix",
  "spice",
  "seasoning",
  "gravy",
  "curry",
  "masala",
]);

const TOKEN_ALIASES: Record<string, string[]> = {
  aloo: ["potato"],
  potato: ["aloo"],
  idli: ["idly"],
  idly: ["idli"],
  dosa: ["dosai"],
  dosai: ["dosa"],
  dal: ["dhal", "lentil"],
  dhal: ["dal", "lentil"],
  lentil: ["dal", "dhal"],
  chana: ["chickpea", "gram"],
  chickpea: ["chana", "gram"],
  yoghurt: ["yogurt", "curd"],
  yogurt: ["yoghurt", "curd"],
  curd: ["yogurt", "yoghurt"],
  coriander: ["cilantro"],
  cilantro: ["coriander"],
  eggplant: ["brinjal", "aubergine"],
  brinjal: ["eggplant", "aubergine"],
  aubergine: ["eggplant", "brinjal"],
  okra: ["bhindi"],
  bhindi: ["okra"],
  roti: ["chapati", "flatbread"],
  chapati: ["roti", "flatbread"],
  flatbread: ["roti", "chapati"],
  capsicum: ["pepper"],
};

export function normalizeFoodMatchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function singularizeToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (/(?:ches|shes|sses|xes|zes|oes)$/.test(token)) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function tokensFromText(value: string): string[] {
  return normalizeFoodMatchText(value)
    .split(" ")
    .filter(Boolean)
    .map(singularizeToken)
    .filter((token) => token.length > 1 && !STOP_TOKENS.has(token));
}

function expandedTokens(tokens: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const token of tokens) {
    expanded.add(token);
    for (const alias of TOKEN_ALIASES[token] ?? []) {
      expanded.add(alias);
    }
  }
  return expanded;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
}

function foodNameText(food: MatchableFood): string {
  const openFoodFacts = asRecord(food.openFoodFacts);
  return [
    food.name,
    firstString(openFoodFacts.product_name_en),
    firstString(openFoodFacts.product_name),
    firstString(openFoodFacts.generic_name),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function foodAllText(food: MatchableFood): string {
  const openFoodFacts = asRecord(food.openFoodFacts);
  return [foodNameText(food), food.brand, firstString(openFoodFacts.brands)]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function detectionQueries(detection: MatchableDetection): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const query of [detection.name, ...(detection.searchQueries ?? [])]) {
    const normalized = normalizeFoodMatchText(query);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    queries.push(query);
  }
  return queries;
}

function tokenMatchesCandidate(
  queryToken: string,
  candidateTokens: Set<string>,
): boolean {
  for (const token of expandedTokens([queryToken])) {
    if (candidateTokens.has(token)) return true;
  }

  for (const candidateToken of candidateTokens) {
    if (queryToken.length >= 4 && candidateToken.startsWith(queryToken)) {
      return true;
    }
    if (candidateToken.length >= 4 && queryToken.startsWith(candidateToken)) {
      return true;
    }
  }

  return false;
}

function scoreFoodForQuery(food: MatchableFood, query: string): number {
  const queryTokens = tokensFromText(query);
  if (queryTokens.length === 0) return 0;
  if (
    queryTokens.length === 1 &&
    WEAK_SINGLE_TOKEN_QUERIES.has(queryTokens[0])
  ) {
    return 0;
  }

  const nameText = foodNameText(food);
  const normalizedNameText = normalizeFoodMatchText(nameText);
  const normalizedAllText = normalizeFoodMatchText(foodAllText(food));
  const queryKey = queryTokens.join(" ");
  const candidateTokens = expandedTokens(tokensFromText(normalizedAllText));

  if (candidateTokens.size === 0) return 0;

  let matchedTokens = 0;
  for (const token of queryTokens) {
    if (tokenMatchesCandidate(token, candidateTokens)) matchedTokens += 1;
  }

  const requiredMatches = queryTokens.length >= 2 ? 2 : 1;
  const hasStrongPhraseMatch =
    normalizedNameText === queryKey ||
    normalizedNameText.startsWith(`${queryKey} `) ||
    normalizedNameText.includes(` ${queryKey} `) ||
    normalizedNameText.endsWith(` ${queryKey}`);

  if (!hasStrongPhraseMatch && matchedTokens < requiredMatches) return 0;

  let score = matchedTokens * 120;
  if (matchedTokens === queryTokens.length) score += 220;
  if (hasStrongPhraseMatch) score += 500;
  if (normalizedNameText === queryKey) score += 500;
  if (normalizedAllText.includes(queryKey)) score += 120;
  score -= Math.min(tokensFromText(nameText).length, 12);
  return score;
}

export function foodMatchScore(
  detection: MatchableDetection,
  food: MatchableFood,
): number {
  let bestScore = 0;
  const queries = detectionQueries(detection);
  const primaryTokenCount = tokensFromText(queries[0] ?? "").length;
  for (const [index, query] of queries.entries()) {
    const queryTokenCount = tokensFromText(query).length;
    if (index > 0 && primaryTokenCount >= 2 && queryTokenCount < 2) continue;
    const score = scoreFoodForQuery(food, query) - index * 0.01;
    if (score > bestScore) bestScore = score;
  }
  return bestScore;
}

export function isPlausibleFoodMatch(
  detection: MatchableDetection,
  food: MatchableFood,
): boolean {
  return foodMatchScore(detection, food) > 0;
}

export function filterAndRankFoodCandidates<T extends MatchableFood>(
  detection: MatchableDetection,
  foods: T[],
): T[] {
  return foods
    .map((food, index) => ({
      food,
      index,
      score: foodMatchScore(detection, food),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ food }) => food);
}

export function normalizeSelectedFoodCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(?:null|none|n\/a|na|no[_\s-]?match)$/i.test(trimmed)) return null;
  return trimmed;
}
