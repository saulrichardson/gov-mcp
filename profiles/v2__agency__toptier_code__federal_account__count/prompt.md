# Federal Account Count – Semantic Guide

## What this endpoint does

Returns the number of distinct federal accounts and treasury account symbols tied to a single agency for a given fiscal year. Defaults to the current fiscal year when no year is provided, and surfaces DATA Act warnings when historical data is unavailable.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/federal_account/count/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `toptier_code` (path, string, required) – Numeric CGAC or FREC identifier, 3–4 digits. Extra digits are trimmed to the last four before validation. Non-numeric segments miss the route and return HTML 404.
  - `fiscal_year` (query, integer, optional) – Accepts integers 2008–2026 inclusive. Omit or send an empty value to use the current fiscal year (2026 observed). Leading zeros are fine; whitespace or other non-digit characters trigger a 400. Out-of-range values return 422 with explicit min/max messages.
- **Routing note:** The trailing slash is required; the server issues a 301 redirect if it is omitted.

---

## How to interpret the response

- Response is a JSON object.
- `toptier_code` echoes the agency code as a zero-padded string.
- `federal_account_count` and `treasury_account_count` report distinct counts for the specified fiscal year.
- `messages` is always an array of strings. Fiscal years 2008–2016 return a DATA Act notice explaining zero results; 2017 and later typically leave it empty.

---

## Known doc mismatches

- Docs claim the request body is numeric, but the live endpoint ignores bodies and uses only the path/query parameters.

---

## Pitfalls & safe-usage checklist

- **Do:** Validate `fiscal_year` inputs client-side and handle 422 bounds errors gracefully.
- **Do:** Inspect `messages` when requesting pre-2017 fiscal years to detect intentional zero counts.
- **Do:** Follow redirects or include the trailing slash to avoid unnecessary round-trips.
- **Don’t:** Assume error payloads are always JSON—non-numeric path segments return HTML.
- **Don’t:** Depend on the current fiscal-year cap remaining 2026; verify when new data releases.

---

## Runnable example

```http
GET /api/v2/agency/012/federal_account/count/?fiscal_year=2024 HTTP/1.1
Host: api.usaspending.gov
Accept: application/json
```

- Returns `federal_account_count: 157` and `treasury_account_count: 778` for the Department of Agriculture in FY 2024.
- `messages` is empty because FY 2024 data is fully populated.
