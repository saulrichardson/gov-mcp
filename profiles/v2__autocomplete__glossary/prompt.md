# Glossary Autocomplete - Semantic Guide

## What this endpoint does

Returns glossary autocomplete suggestions for a provided term fragment. Responses include both the matched term titles and rich glossary metadata for each hit.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/glossary/`
- **Auth:** None required in observed probes.
- **Parameters:**
  - `search_text` (body, string|number|boolean|object, required) - must be present and truthy. Only non-empty strings participate in matching; null, empty string, or boolean `false` trigger a 400 error. Truthy non-string inputs are echoed back but return no matches.
  - `limit` (body, number|string|boolean, optional) - defaults to 10. Coerced with `int()` semantics: decimals truncate toward zero, numeric strings parse, and booleans map to 1 or 0. Values that coerce to 0 yield empty arrays. Negative numbers, null, or non-scalar values surface 500 HTML errors; non-numeric strings return a 400 validation error.

---

## How to interpret the response

- Top-level JSON object containing `search_text`, `results`, `count`, and `matched_terms`.
- `results` is an ordered array of glossary term titles (strings), aligned with `matched_terms`.
- `matched_terms` contains objects with `term`, `slug`, `data_act_term`, `plain`, `official`, and `resources` (strings or null for the nullable fields) matching the order of `results`.
- `count` equals the number of items returned; it does not expose the total available matches.
- The echoed `search_text` retains the caller's original JSON type.

---

## Known doc mismatches

- Docs claim `search_text` must be a string, but the API accepts any truthy JSON value and only rejects falsy inputs.
- Docs state `limit` is a number, yet the API coerces booleans, numeric strings, and decimals, and emits 500 HTML errors when given null, negatives, or non-scalar values.

---

## Pitfalls & safe-usage checklist

- **Do:** Validate `limit` client-side and guard against non-JSON 500 responses when upstream input is invalid.
- **Do:** Trim or reject user whitespace-only strings before sending; the service preserves whitespace and returns no matches for such inputs.
- **Don't:** Assume response text fields are plain text; they may contain Markdown links and newlines.
- **Don't:** Assume the echoed `search_text` is always a string; coerce or validate before reuse.

---

## Runnable example

```http
POST /api/v2/autocomplete/glossary/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "search_text": "award",
  "limit": 2
}
```

- Returns two suggestions beginning with `search_text` and their matching glossary records.
- `matched_terms[0].plain` includes multi-line Markdown content; sanitize before display if needed.
