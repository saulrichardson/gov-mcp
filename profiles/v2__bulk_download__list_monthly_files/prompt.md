# List Monthly Files – Semantic Guide

## What this endpoint does
Returns metadata about pre-generated monthly bulk download archives for a specified fiscal year and agency, filtered by assistance or contracts files.

---

## How to call it
- **Method & path:** `POST /api/v2/bulk_download/list_monthly_files/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `agency` (body, string/integer) – Provide a numeric toptier agency ID or `'all'`. Unknown numeric IDs return HTTP 400; other strings trigger HTML 500. Omission is unverified.
  - `fiscal_year` (body, string/integer) – Supply the fiscal year. Numeric inputs (or numeric strings) are echoed in the response; arbitrary text succeeds but only returns the FY(All) delta file.
  - `type` (body, string, required) – Use `'assistance'` or `'contracts'`. Missing or null yields HTTP 400; other strings return 200 with an empty `monthly_files` list.

---

## How to interpret the response
- Returns a JSON object with `monthly_files: []`.
- Each entry includes `agency_name`, `agency_acronym` (nullable), `fiscal_year` (number, string, or null), `type`, `updated_date`, `file_name`, and `url`.
- No pagination fields are present; treat the array as the complete set for the request.

---

## Known doc mismatches
- Docs state `type` is optional, but the API returns HTTP 400 when it is omitted.
- Docs require `MonthlyFile.fiscal_year` to be a number, yet responses include null and string values.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - POST requests only; GET returns HTTP 405 with a JSON error.
  - Implement retries for occasional connection resets without HTTP status codes.
  - Validate agency identifiers before calling to avoid HTML error pages.
- **Don’t:**
  - Don’t assume a 200 response means files exist; verify `monthly_files` is non-empty.
  - Don’t rely on typos in `type` or `fiscal_year` being rejected—the service accepts them silently.

---

## Runnable examples
```http
POST /api/v2/bulk_download/list_monthly_files/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"agency":"all","fiscal_year":2023,"type":"assistance"}
```
- Returns two entries: the FY2023 full assistance archive and the FY(All) assistance delta file, each with filename, updated date `2026-02-06`, and download URL.
