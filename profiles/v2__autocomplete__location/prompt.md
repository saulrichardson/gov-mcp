# Location Autocomplete - Semantic Guide

## What this endpoint does

Provides case-insensitive autocomplete suggestions for countries, states, cities, counties, ZIP codes, and congressional districts based on a search prefix. Results arrive grouped by category with a total suggestion count and an informational messages array.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/location/`
- **Host:** `api.usaspending.gov`
- **Auth:** None observed in probes.
- **Parameters:**
  - `search_text` (body, string, required) - length must be at least 1; matching ignores leading/trailing whitespace and is case-insensitive. Whitespace-only strings still succeed but return broad, low-signal results. Non-string inputs yield 400 with a `detail` message.
  - `limit` (body, integer, optional) - per-category cap; defaults to 5. Accepts integers 1-20 inclusive, including digit-only strings. Floats, non-numeric strings, null, or booleans return 400; values >20 return 422; values <=0 trigger a 503 with no body. Unknown extra fields are ignored.

---

## How to interpret the response

- Successful responses are JSON objects with `count`, `results`, and `messages`.
- `count` equals the sum of all suggestion array lengths and is zero when no matches are found.
- `results` is an object containing optional arrays: `countries`, `states`, `cities`, `counties`, `zip_codes`, `districts_original`, `districts_current`. Categories are omitted when empty; string values are uppercased; ZIP codes are strings with preserved leading zeros; foreign city entries omit `state_name`.
- `messages` has only been observed as `['']`; treat it as informational-only until populated cases are documented.
- Error responses return a JSON object with `detail` (400/422) or, for invalid low limits, a bare 503 with no body.

---

## Known doc mismatches

- Documentation claims `zip_code` is numeric, but live responses return strings (e.g., `"20500"`).
- Documentation marks `state_name` as required for cities, yet foreign city suggestions omit the field entirely.
- Documentation omits the success-level `count` field that is always present in responses.

---

## Pitfalls & safe-usage checklist

- **Do:** Validate `limit` locally and guard against values <=0 to avoid 503s without payloads.
- **Do:** Trim user-entered search text and handle missing `state_name` values in foreign city results.
- **Do:** Prepare error handling for both JSON `detail` responses and bodyless 503s.
- **Don't:** Assume every category appears; always null-check arrays in `results` before iterating.
- **Don't:** Treat `messages` as actionable until you observe non-empty content in your environment.

---

## Runnable examples

```http
POST /api/v2/autocomplete/location/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"search_text":"AL-01"}
```

- Returns `count: 2` with both `districts_original` and `districts_current` arrays containing Alabama district `AL-01` plus `messages: [""]`.
