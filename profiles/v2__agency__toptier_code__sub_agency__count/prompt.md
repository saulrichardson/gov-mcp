# Sub-Agency Count – Semantic Guide

## What this endpoint does
Counts distinct sub-agencies and offices for a toptier agency in a single fiscal year, using either the awarding or funding perspective. Defaults to the latest fiscal year and returns optional warning messages when historical coverage is limited.

---

## How to call it
- **Method & path:** `GET /api/v2/agency/{toptier_code}/sub_agency/count/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `toptier_code` (path, string, required) – 3–4 digit numeric string with significant leading zeros. Unknown numeric codes return JSON 404; malformed or mis-padded values (e.g., `12A`, `12`) return an HTML 404 page.
  - `fiscal_year` (query, integer, optional) – Accepts 2008–2026 (observed bounds). Omit or pass an empty value to use the current year; non-integer or whitespace-only inputs raise 400; values outside the range raise 422.
  - `agency_type` (query, string, optional) – Case-sensitive enum `awarding` or `funding`. Defaults to awarding when omitted or empty; any other value, including uppercase variants, raises 400.

---

## How to interpret the response
- Returns a JSON object with `toptier_code`, `fiscal_year`, `sub_agency_count`, `office_count`, and `messages`.
- `sub_agency_count` and `office_count` are integers and can legitimately be zero for some agencies.
- `messages` is an array of strings; fiscal years prior to 2017 include a DATA Act coverage warning, while later years typically leave it empty.

---

## Known doc mismatches
- Docs label `toptier_code` as a number, but the API requires a zero-padded numeric string.
- Documentation specifies a numeric request body, yet the endpoint ignores bodies and uses only path/query parameters.
- Docs imply JSON errors for invalid paths, but malformed `toptier_code` values return an HTML 404 page.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Keep `fiscal_year` within 2008–2026 and handle 422 errors when the window advances.
  - Preserve leading zeros on `toptier_code` inputs to avoid HTML 404 responses.
  - Inspect `messages` for DATA Act warnings when querying pre-2017 fiscal years.
- **Don’t:**
  - Don’t send uppercase or whitespace-only `agency_type` values; they raise 400 errors.
  - Don’t assume non-zero counts; zero totals are valid results for some agencies.

---

## Runnable examples
```http
GET /api/v2/agency/012/sub_agency/count/?fiscal_year=2024&agency_type=funding HTTP/1.1
Host: api.usaspending.gov
Accept: application/json
```
- Returns `200 OK` with `sub_agency_count: 42`, `office_count: 1316`, and `messages: []`.
