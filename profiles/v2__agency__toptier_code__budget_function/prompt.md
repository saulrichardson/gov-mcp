# List Budget Function – Semantic Guide

## What this endpoint does

Returns an agency's budget functions and subfunctions for a fiscal year, including obligated and gross outlay totals. Defaults to the current fiscal year when no year is supplied and supports optional text filtering and pagination.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/budget_function/`
- **Auth:** None observed (public endpoint).
- **Parameters:**
  - `toptier_code` (path, string, required) – Digits-only agency code; 3–4 digit values work. Non-numeric paths return an HTML 404.
  - `fiscal_year` (query, integer, optional) – Range 2008–2026. Defaults to current FY; values before 2017 return empty data with a message. Decimals or non-numeric values trigger 400 errors; out-of-range integers yield 422 errors.
  - `filter` (query, string, optional) – Case-insensitive substring across function and subfunction names. Empty string behaves like omission; matches constrain children and recompute parent totals.
  - `sort` (query, string, optional) – One of `name`, `obligated_amount`, `gross_outlay_amount`. Defaults to `obligated_amount`; invalid entries return 400.
  - `order` (query, string, optional) – `asc` or `desc`. Defaults to `desc`; invalid entries return 400.
  - `page` (query, integer, optional) – One-based index; defaults to 1. Zero triggers a 422 error; decimals trigger 400.
  - `limit` (query, integer, optional) – Results per page; defaults to 10. Valid range 1–100. Values outside the range or decimal inputs are rejected (422 for range violations, 400 for decimals).

---

## How to interpret the response

- Returns a JSON object with `toptier_code`, `fiscal_year`, `results`, `messages`, and `page_metadata`.
- `results` is an array of budget functions. Each function contains `name`, `obligated_amount`, `gross_outlay_amount`, and a `children` array of matching subfunctions with their own totals.
- `messages` is usually empty but conveys guidance (e.g., pre-FY2017 requests explain why data is absent).
- `page_metadata` echoes pagination state (`page`, `total`, `limit`, nullable `next`/`previous`, and boolean flags).

---

## Known doc mismatches

- Docs claim the GET request body is a number, but the live API uses only path and query parameters.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate both 400 and 422 responses when handling parameter errors.
  - Surface `messages` to explain empty result sets, especially for older fiscal years.
  - Treat large monetary fields as high-precision decimals to avoid rounding issues.
- **Don’t:**
  - Don’t assume the response is JSON when the path segment is malformed; HTML 404s are possible.
  - Don’t request pre-2017 fiscal years without checking for guidance messages in the payload.

---

## Runnable example

```http
GET /api/v2/agency/086/budget_function/?fiscal_year=2022&limit=1 HTTP/1.1
Host: api.usaspending.gov
Accept: application/json
```

- Returns the first budget function (sorted by obligated amount descending) for toptier code `086` in FY2022.
- `page_metadata.next` is set to `2`, indicating additional pages are available.
- `messages` is empty when data exists for the requested year.
