# Treasury Account Object Class – Semantic Guide

## What this endpoint does

Returns obligated and gross outlay totals grouped by object class for a given Treasury Account Symbol (TAS). Supports paging, basic sorting, and a text filter, and always echoes the TAS and fiscal year used in the aggregation.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/treasury_account/{tas}/object_class/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `tas` (path, string, required) – Hyphenated TAS identifier; endpoint requires the trailing slash. Invalid codes still return 200 with `results: []`, so validate upstream.
  - `fiscal_year` (query, integer, optional) – Defaults to the API’s current FY (2026). Accepts 2008–2026 inclusive; outside range → 422; non-integers → 400. FYs before 2017 respond with empty results plus a DATA Act warning.
  - `filter` (query, string, optional) – Case-insensitive text filter with inconsistent token matching. Partial tokens may match while exact words fail, and child rows remain unfiltered.
  - `order` (query, string, optional) – Sort direction (`asc` or `desc`, default `desc`). Values are case-sensitive; anything else → 400.
  - `sort` (query, string, optional) – Sort field (`obligated_amount` default, or `gross_outlay_amount`, `name`). Invalid values → 400.
  - `page` (query, integer, optional) – Defaults to 1. Must be ≥1; 0 → 422; non-integers → 400. Pages beyond available data return empty results.
  - `limit` (query, integer, optional) – Defaults to 10. Accepts 1–100 inclusive; outside range → 422; non-integers → 400.

---

## How to interpret the response

- Response is an object containing the echoed TAS, the fiscal year used, `page_metadata`, `results`, and `messages`.
- `page_metadata` exposes `page`, `total`, `limit`, nullable `next`/`previous`, plus boolean `hasNext`/`hasPrevious`.
- `results` is an array of object classes. Each item includes `name`, `obligated_amount`, `gross_outlay_amount`, and a `children` array of program activities (which may be empty or retain unfiltered totals).
- `messages` is usually empty; pre-FY2017 requests return a DATA Act coverage warning.
- Monetary fields can be negative (e.g., deobligations) and filters can zero out parent totals while children remain populated.

---

## Known doc mismatches

- Docs do not mention the enforced 1–100 bounds on `limit`, but the API rejects values outside that window with 422 errors.
- Documentation claims `filter` matches object class names directly, yet probes show exact labels like “Contractual” return zero rows while partial tokens succeed.
- Docs imply children always populate; current-fiscal-year calls often return empty `children` arrays.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Explicitly set `fiscal_year` to avoid defaulting to preliminary FY2026 data with empty children.
  - Inspect `messages` for warnings whenever results come back empty.
  - Honor pagination metadata (`page`, `hasNext`, `next`) rather than assuming contiguous data.
- **Don’t:**
  - Don’t rely on `filter` totals without cross-checking child program activities; mismatches are common.
  - Don’t assume `children` arrays are populated or filtered; handle empty arrays and intact child totals.
  - Don’t expect JSON bodies for redirects or 404s; missing trailing slash returns HTML.

---

## Runnable examples

```http
GET /api/v2/agency/treasury_account/097-X-4930-001/object_class/?fiscal_year=2020&limit=2 HTTP/1.1
Host: api.usaspending.gov
```

- Returns HTTP 200 with object classes for FY2020, including `page_metadata` showing `total: 5`, `limit: 2`, and `next: 2`.
- `results[0]` contains the object class name, obligated and gross outlay amounts, and a `children` array with program activity breakdowns.
- Stop paging when `hasNext` is `false` or `next` is `null`.
