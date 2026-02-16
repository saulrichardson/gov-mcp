# Program Activity Listing – Semantic Guide

## What this endpoint does

Returns a paginated list of program activities for a specified toptier agency and fiscal year, including obligated and gross outlay aggregates. Older fiscal years (pre-2017) respond with empty results and an advisory message instead of failing.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/program_activity/`
- **Auth:** None required in observed probes.
- **Parameters:**
  - `toptier_code` (path, string, required) – 3-4 digit CGAC/FREC agency code; invalid codes return an HTML 404 page.
  - `fiscal_year` (query, integer, optional) – defaults to the current FY (observed 2026); accepts 2008–2026; 2008–2016 return empty results plus a DATA Act warning.
  - `filter` (query, string, optional) – case-insensitive substring match on program activity names; empty string behaves like no filter.
  - `order` (query, string, optional) – `asc` or `desc` (default); other values return 400 validation errors.
  - `sort` (query, string, optional) – one of `name`, `obligated_amount`, `gross_outlay_amount` (default `obligated_amount`).
  - `page` (query, integer, optional) – ≥1, default 1; pages beyond available data return empty `results` and can clear `previous`/`hasPrevious`.
  - `limit` (query, integer, optional) – 1–100, default 10; values outside the range return 422, non-integers return 400.

---

## How to interpret the response

- Response is a JSON object with `toptier_code`, `fiscal_year`, `page_metadata`, `results`, and `messages`.
- `page_metadata.total` reports total matching activities; `next`/`previous` are integers or null; `hasNext`/`hasPrevious` flag navigation availability.
- `results` is an array of objects with `name`, `obligated_amount`, and `gross_outlay_amount`; amounts may be zero or negative and names can be `"N/A"`.
- `messages` is usually empty but includes advisory text (e.g., DATA Act coverage) for unsupported fiscal years.

---

## Known doc mismatches

- Spec documents a `totals` object in 200 responses, but live responses omit it entirely.
- Spec shows `page_metadata.count`; the API returns `page_metadata.total` instead.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Specify `fiscal_year` explicitly to avoid empty current-year defaults.
  - Check `messages` for warnings before assuming missing data is an error.
  - Handle negative financial values when aggregating results.
- **Don’t:**
  - Don’t assume JSON error payloads for invalid `toptier_code`; HTML 404 responses occur.
  - Don’t rely on `previous`/`hasPrevious` when requesting pages beyond available data—they may reset despite a high `page` value.

---

## Runnable examples

```http
GET /api/v2/agency/086/program_activity/?fiscal_year=2024&limit=5 HTTP/1.1
Host: api.usaspending.gov
Accept: application/json
```

- Returns the first page (5 records) of FY2024 HUD program activities.
- `page_metadata.total` reflects the full match count (151 in observed probe).
- `messages` is empty when data are available for the requested fiscal year.
