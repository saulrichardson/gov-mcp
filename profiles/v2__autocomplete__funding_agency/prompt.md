# Funding Agency Autocomplete – Semantic Guide

## What this endpoint does

Returns autocomplete suggestions for funding agencies that contain the provided search text. The service is deprecated but still responds with agency metadata for use in advanced search flows.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/funding_agency/`
- **Auth:** None observed in probes.
- **Parameters:**
  - `search_text` (body, string, required) – case-insensitive substring to match; the API does not trim whitespace, and falsy values (null, empty string, 0, false, empty collections) trigger a 400 missing-parameter error.
  - `limit` (body, integer, optional) – defaults to 10; accepts non-negative integers, numeric strings, floats (floored), and booleans; `0` returns an empty result set; non-numeric strings raise a 400 validation error, while null, objects, arrays, or negatives provoke a 500 HTML server error.

---

## How to interpret the response

- Top-level response is an object with `results` (array) and `messages` (array of warning strings).
- Each result object includes `id`, `toptier_flag`, a `toptier_agency` object (`toptier_code`, `abbreviation` which may be null, `name`), and a `subtier_agency` object (`abbreviation` may be null, `name`).
- Successful responses always include the deprecation warning in `messages`; no pagination metadata is returned.

---

## Known doc mismatches

- Invalid `limit` types (negative, null, non-scalar) return HTML 500 pages instead of the documented JSON errors.
- Although docs state `limit` is a number, the service also accepts numeric strings, floats, and booleans.

---

## Pitfalls & safe-usage checklist

- **Do:** Trim user-provided search text before sending to avoid silent empty matches.
- **Do:** Validate `limit` client-side and clamp to a reasonable non-negative integer.
- **Do:** Expect potentially large payloads when requesting very high `limit` values (all observed matches returned for `limit=100000`).
- **Don’t:** Rely on the endpoint for long-term integrations; it is explicitly deprecated and may be removed.
- **Don’t:** Send negative or structured `limit` values unless you are prepared to handle 500 HTML responses.

---

## Runnable examples

```http
POST /api/v2/autocomplete/funding_agency/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"search_text":"Defense","limit":1}
```

- Responds `200` with the top match, including `toptier_agency` and `subtier_agency` details, plus the deprecation warning in `messages`.
