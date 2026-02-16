# NAICS Autocomplete – Semantic Guide

## What this endpoint does

Returns NAICS codes and descriptions that match the supplied search text, including retired codes when applicable. Results are limited to the number specified by `limit` (default 10) and come back in a single array without pagination metadata.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/naics/`
- **Auth:** Not required in observed probes.
- **Body parameters:**
  - `search_text` (body, string, required) – Non-empty string used to match NAICS codes and descriptions. Matching ignores case but preserves leading/trailing whitespace, which can change the results. Null, empty, or non-string values trigger errors (400 for missing, 500 for non-string).
  - `limit` (body, integer, optional) – Non-negative integer cap on returned matches (default 10). JSON floats are truncated toward zero and numeric strings are parsed; zero yields an empty list. Negative or null values raise HTTP 500, and non-numeric strings return HTTP 400 with `Limit request parameter is not a valid, positive integer`.

---

## How to interpret the response

- Response is always an object with a `results` array.
- Each entry contains:
  - `naics` – NAICS code as a string.
  - `naics_description` – Description of the code.
  - `year_retired` – Integer retirement year for retired codes, or null for active ones.
- No pagination fields are returned; large limits produce large payloads (1,153 rows observed).

---

## Known doc mismatches

- Docs describe `limit` as a generic numeric field, but the API requires a non-negative integer after parsing; null or negative values cause HTTP 500 and non-numeric strings return HTTP 400.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Trim or intentionally preserve whitespace in `search_text` so matches behave as expected.
  - Bound `limit` to a sensible size to avoid multi-megabyte responses.
  - Validate `limit` client-side to prevent 400/500 errors from invalid values.
- **Don’t:**
  - Don’t send non-string `search_text` values; they raise HTTP 500.
  - Don’t rely on the returned order to express ranking precision—the ordering heuristics are still unknown.

---

## Runnable examples

```http
POST /api/v2/autocomplete/naics/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "search_text": "construction",
  "limit": 3
}
```

- Returns three construction-related NAICS entries with `year_retired: null`.
