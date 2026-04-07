const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "find",
  "for",
  "get",
  "help",
  "i",
  "investigate",
  "list",
  "me",
  "please",
  "show",
  "the",
  "to",
  "use",
  "want",
]);

function normalizeText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_/.-]+/g, " ")
    .toLowerCase();
}

function maybeSingularize(token: string): string | null {
  if (token.length <= 3) return null;
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("ses") || token.endsWith("ss") || token.endsWith("us") || token.endsWith("is")) {
    return null;
  }
  if (token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return null;
}

function expandToken(token: string): string[] {
  const variants = new Set<string>();
  variants.add(token);
  const singular = maybeSingularize(token);
  if (singular) variants.add(singular);
  return Array.from(variants);
}

export function searchTokens(value: string, { dropStopWords = false }: { dropStopWords?: boolean } = {}): string[] {
  const normalized = normalizeText(value);
  const parts = normalized.match(/[a-z0-9]+/g) || [];
  const tokens = new Set<string>();

  for (const part of parts) {
    if (dropStopWords && STOP_WORDS.has(part)) continue;
    for (const variant of expandToken(part)) {
      if (!variant) continue;
      if (dropStopWords && STOP_WORDS.has(variant)) continue;
      tokens.add(variant);
    }
  }

  return Array.from(tokens);
}

export function scoreSearchQuery(query: string | undefined, fields: string[]): number {
  const rawQuery = (query || "").trim();
  if (!rawQuery) return 1;

  const normalizedFields = fields
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizeText(value));
  const haystack = normalizedFields.join(" ");
  const hayTokens = new Set(searchTokens(haystack));
  const queryTokens = searchTokens(rawQuery, { dropStopWords: true });
  const effectiveTokens = queryTokens.length > 0 ? queryTokens : searchTokens(rawQuery);

  let score = 0;

  const normalizedQuery = normalizeText(rawQuery).trim();
  if (normalizedQuery && haystack.includes(normalizedQuery)) {
    score += 100;
  }

  for (const token of effectiveTokens) {
    if (hayTokens.has(token)) {
      score += 10;
      continue;
    }
    if (haystack.includes(token)) {
      score += 4;
    }
  }

  return score;
}
