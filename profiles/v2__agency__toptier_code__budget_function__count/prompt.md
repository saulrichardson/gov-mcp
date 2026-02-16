# Budget Function Count – Semantic Guide

## What this endpoint does
Counts the distinct budget functions and sub-functions tied to a single agency toptier code for a specified fiscal year. Defaults to the current fiscal year when no year is supplied.

---

## How to call it
- **Method & path:** `GET /api/v2/agency/{toptier_code}/budget_function/count/`
- **Auth:** Not required (observed probes returned without credentials).
- **Parameters:**
  - `toptier_code` (path, string, required) – 3-4 digit numeric agency identifier; non-numeric or wrong-length values fall through the route and return an HTML 404.
  - `fiscal_year` (query, integer, optional) – Accepts integers `2008`–`2026`; omit or send a blank string to use the current fiscal year; non-integer inputs return 400, out-of-range years return 422, leading zeros are tolerated.

---

## How to interpret the response
- Response is a JSON object.
- `toptier_code` and `fiscal_year` echo the resolved inputs.
- `budget_function_count` and `budget_sub_function_count` supply the distinct counts for the agency-year slice.
- `messages` is an array of informational strings; for fiscal years before DATA Act coverage (pre-2017) it includes a warning that the counts are empty due to missing data.

---

## Known doc mismatches
- Contract schema claims the request body is a number, but the live API is a RESTful GET with path and query parameters only.
- Docs describe `toptier_code` as a number, yet the service requires a 3-4 digit numeric string and rejects other formats.

---

## Pitfalls & safe-usage checklist
- **Do:** Force IPv4 if your client sees dropped IPv6 connections.
- **Do:** Handle 400 and 422 validation errors for malformed or out-of-range `fiscal_year` values.
- **Do:** Inspect `messages` for warnings when querying historical fiscal years.
- **Don’t:** Assume all errors are JSON; HTML 404 pages appear for malformed `toptier_code` paths.

---

## Runnable examples
```http
GET /api/v2/agency/012/budget_function/count/?fiscal_year=2023 HTTP/1.1
Host: api.usaspending.gov
```

- Returns `200 OK` with counts `{ "budget_function_count": 9, "budget_sub_function_count": 17 }` and an empty `messages` array.
