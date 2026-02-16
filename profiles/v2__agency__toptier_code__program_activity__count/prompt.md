# Program Activity Count – Semantic Guide

## What this endpoint does

Returns the number of distinct program activity categories tied to a specific agency toptier code for a single fiscal year. Defaults to the platform's latest reporting year when no fiscal year is provided and surfaces DATA Act warnings for pre-2017 requests.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/program_activity/count/`
- **Auth:** Not required in observed calls.
- **Parameters:**
  - `toptier_code` (path, string, required) – 3–4 digit numeric string mapped to a real CGAC/FREC; missing leading zeros or non-numeric values fall through to an HTML 404; values longer than four digits are truncated to the last four before validation.
  - `fiscal_year` (query, integer, optional) – Accepts 2008–2026 inclusive (observed); defaults to 2026 when omitted or blank; duplicate keys honor the last value; unknown query params are ignored; non-integers receive 400 and out-of-range integers receive 422.

---

## How to interpret the response

- Response is a JSON object with `toptier_code`, `fiscal_year`, `program_activity_count`, and `messages`.
- `program_activity_count` can legitimately be zero (e.g., current FY or before DATA Act reporting).
- `messages` is always present as an array; pre-2017 fiscal years include the standard DATA Act warning, otherwise the array is empty.

---

## Known doc mismatches

- Docs claim a numeric request body, but the live endpoint uses only path/query parameters.
- Docs describe `toptier_code` as numeric, yet the API expects a zero-padded digit string and returns it as a string.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate toptier codes before calling and treat HTML 404 responses as routing failures.
  - Monitor fiscal year bounds and surface 422 errors when the platform advances reporting years.
  - Inspect `messages` for warnings when querying older fiscal years and handle zero counts as valid data.
- **Don’t:**
  - Don’t send non-numeric or under-padded toptier codes; they won’t reach the JSON handler.
  - Don’t pad toptier codes beyond four digits unless you also watch for truncation-driven 404s.

---

## Runnable examples

```http
GET /api/v2/agency/012/program_activity/count/?fiscal_year=2020 HTTP/1.1
Host: api.usaspending.gov
```

- Returns HTTP 200 with `{ "toptier_code": "012", "fiscal_year": 2020, "program_activity_count": 510, "messages": [] }`.
