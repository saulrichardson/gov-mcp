# v2/agency/toptier_code/federal_account – Semantic Guide

## What this endpoint does

Returns the federal accounts funded by a toptier agency for a fiscal year, including obligated and gross outlay totals and their treasury account children. Pagination metadata and optional warning messages are included with every response.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/federal_account/`
- **Auth:** None required in observed probes.
- **Parameters:**
  - `toptier_code` (path, string, required) – 3–4 digit numeric code. Unknown numeric values return JSON 404; non-numeric segments yield an HTML 404 page.
  - `fiscal_year` (query, integer, optional) – 2008–2026 inclusive, default latest published year (2026 during probes). Out-of-range values return 422, non-integers return 400, and pre-FY2017 years respond with empty results plus a warning message.
  - `filter` (query, string, optional) – Case-insensitive substring match against federal account names and codes. Unmatched filters simply return empty results.
  - `sort` (query, string, optional) – Lowercase `name`, `obligated_amount`, or `gross_outlay_amount`. Defaults to `obligated_amount`; other inputs return 400.
  - `order` (query, string, optional) – Lowercase `asc` or `desc`. Defaults to `desc`; supplying `asc` alone flips the default. Other casing (e.g., `ASC`) is rejected with 400.
  - `page` (query, integer, optional) – Page index ≥ 1, default 1. Non-integers return 400; values below 1 return 422.
  - `limit` (query, integer, optional) – Page size 1–100, default 10. Non-integers return 400; values outside range return 422.

---

## How to interpret the response

- Response is an object with `toptier_code`, `fiscal_year`, `page_metadata`, `results`, and `messages`.
- `page_metadata` includes `page`, `total`, `limit`, nullable `next`/`previous`, and boolean `hasNext`/`hasPrevious` for pagination.
- Each `results` item provides the federal account `code`, `name`, `obligated_amount`, `gross_outlay_amount`, and a `children` array listing treasury accounts with the same fields.
- `messages` is an array of warning/info strings; FY2008+ requests before FY2017 include a data-availability warning here.

---

## Known doc mismatches

- Documentation promises a top-level `totals` object, but live responses never include it.
- Documentation claims `total_budgetary_resources` exists on both federal and treasury account entries; the field is absent in production.
- Documentation lists `total_budgetary_resources` as a valid `sort` option, yet the API returns HTTP 400 when it is used.

---

## Pitfalls & safe-usage checklist

- **Do:** Validate fiscal year, pagination, and enum casing client-side to avoid 400/422 validation failures.
- **Do:** Provide lowercase `sort`/`order` values and include `order` only when you need to flip the default sort direction.
- **Do:** Inspect `messages` when querying pre-FY2017 years to detect empty results caused by coverage limits.
- **Don't:** Depend on the documented `totals` object or `total_budgetary_resources` fields—they are missing from actual payloads.
- **Don't:** Send alphabetic `toptier_code` segments if you expect JSON errors; the service responds with an HTML 404 page.

---

## Runnable examples

```http
GET /api/v2/agency/086/federal_account/?fiscal_year=2025&filter=mortgage&limit=50 HTTP/1.1
Host: api.usaspending.gov
```
- Returns three mortgage-related federal accounts with their treasury account children.
- `page_metadata.total` is 3 and `messages` is empty because the filter matched live records.
- Lowercase `limit` and `filter` parameters keep the request within the validated ranges.
