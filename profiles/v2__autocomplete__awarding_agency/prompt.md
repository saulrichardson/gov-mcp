# Awarding Agency Autocomplete – Semantic Guide

## What this endpoint does

Provides autocomplete suggestions for awarding agencies, returning toptier and subtier metadata for the supplied search fragment. The service is deprecated and currently responds with a deprecation warning alongside every payload.

It is still useful as an agency-resolution step because observed toptier agency names from this endpoint worked directly in `filters.agencies` for spending trend searches.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/awarding_agency/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `search_text` (body, string, required) – Rejects null, empty, or omitted values; whitespace-only strings are accepted and yield broad results; numeric and boolean scalars are coerced to strings before matching.
  - `limit` (body, integer, optional) – Defaults to 10; accepts non-negative integers, JSON floats (truncated toward zero), and integer-like strings; zero returns an empty list; decimal strings such as `"2.9"` return HTTP 400; negative values trigger a 500 HTML error; no cap observed up to 500 results.

---

## How to interpret the response

- Top-level object containing `results` and `messages`.
- `results` is an array of agency objects with `id`, `toptier_flag`, `toptier_agency` (toptier_code, abbreviation which can be null, name), and `subtier_agency` (abbreviation which can be null, name).
- `messages` is an array of informational strings; all observed responses contain the deprecation warning.
- For downstream trend analysis, observed successful agency filters used `toptier_agency.name` with an object shaped like `{ "type": "awarding", "tier": "toptier", "name": "<toptier_agency.name>" }`.

---

## Known doc mismatches

- Documentation labels `limit` as a generic number, but the API enforces positive integers: decimal strings fail with HTTP 400 and negatives crash the server with HTML 500 responses.

---

## Pitfalls & safe-usage checklist

- **Do:** Validate and clamp `limit` client-side to avoid negative or oversized requests, and trim whitespace from `search_text` when broad catch-all results are undesirable.
- **Do:** Inspect `messages` for warnings; the deprecation notice is always present and signals migration urgency.
- **Do:** Prefer the toptier agency name when constructing awarding-agency trend filters unless you specifically need a subtier breakdown.
- **Don’t:** Send negative `limit` values or decimal strings—these either crash the endpoint or return HTTP 400.
- **Don’t:** Assume non-string payloads will fail fast; the service coerces scalars like numbers or booleans into strings and will respond successfully (typically with zero matches).

---

## Runnable examples

```http
POST /api/v2/autocomplete/awarding_agency/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"search_text": "Defense", "limit": 5}
```

- Returns a 200 JSON payload with matching agencies; each entry includes toptier/subtier metadata and `messages` contains the deprecation warning.
