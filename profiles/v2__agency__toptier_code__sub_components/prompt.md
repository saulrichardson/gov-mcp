# v2/agency/toptier_code/sub_components – Semantic Guide

## What this endpoint does

Returns sub-component level appropriation rollups for a toptier agency and fiscal year, including budgetary totals. Supports pagination and sorting of the aggregates.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/sub_components/`
- **Auth:** None required (observed).
- `toptier_code` (path, string, required) – numeric CGAC/FREC code (3-4 digits). Non-numeric values return an HTML 404 page; unknown codes return JSON 404.
- `fiscal_year` (query, integer, optional) – defaults to the latest published year (2026). Validator allows 2008–2026, but 2008–2016 triggered HTML 500 errors; non-integers return 400 and >2026 returns 422.
- `agency_type` (query, string, optional) – documented as `awarding`|`funding`, yet the API accepts arbitrary/blank/uppercase inputs and falls back to awarding data. Awarding and funding matched in sampled agencies.
- `sort` (query, string, optional) – defaults to `total_budgetary_resources`. Allowed: `name`, `total_obligations`, `total_outlays`, `total_budgetary_resources`; other values raise 400.
- `order` (query, string, optional) – defaults to `desc`. Only lowercase `asc` or `desc` accepted; uppercase variants fail.
- `page` (query, integer, optional) – defaults to 1. Must be ≥1; lower or non-integer values error. Out-of-range pages return empty results and may omit `previous`/`hasPrevious`.
- `limit` (query, integer, optional) – defaults to 10. Range 1–100; outside range yields 422 and non-integers 400.

---

## How to interpret the response

- Response is an object containing `toptier_code`, `fiscal_year`, `results`, `messages`, and `page_metadata`.
- `results` is an array of sub-components with `name`, kebab-case `id`, `total_budgetary_resources`, and nullable `total_obligations` / `total_outlays` (values may be negative).
- `messages` remained an empty array across successes, empty datasets, and fallback agency_type calls.
- `page_metadata` supplies `page`, `total`, `limit`, `next`, `previous`, `hasNext`, `hasPrevious`; some agencies null out the previous flags on empty pages.

---

## Known doc mismatches

- Sort validator includes `total_outlays`, which the documentation omits.
- Returned `id` values are kebab-case rather than the documented snake_case.
- `agency_type` is not enforced as an enum; arbitrary values fall back to awarding data.
- `total_outlays` can be null even though documentation marks it as required.

---

## Pitfalls & safe-usage checklist

- **Do:** Handle HTML error bodies for fiscal years ≤2016 and for malformed path parameters; response content-type can switch to `text/html`.
- **Do:** Treat financial totals as nullable/negative and guard pagination logic when `previous`/`hasPrevious` disappear on empty pages.
- **Don't:** Assume `agency_type=funding` delivers different data or that unsupported sort/order values are silently ignored—they return hard validation errors.

---

## Runnable examples

```http
GET /api/v2/agency/086/sub_components/?limit=3 HTTP/1.1
Host: api.usaspending.gov
Accept: application/json
```

- Returns FY2026 HUD sub-components with budgetary totals; `page_metadata` shows `total: 8` and `hasNext: false` when all rows fit within the chosen limit.
