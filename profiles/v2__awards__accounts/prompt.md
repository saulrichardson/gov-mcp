# Award Federal Accounts – Semantic Guide

## What this endpoint does
Returns the federal accounts tied to a specific award, including each account's obligated amount and funding agency metadata. Responses are paginated and honor server-side sorting controls.

---

## How to call it
- **Method & path:** `POST /api/v2/awards/accounts/`
- **Auth:** None observed in validation probes.
- **Parameters:**
  - `award_id` (body, string or integer, required) – Provide the generated internal award identifier. Empty strings, null, or booleans trigger 422; unknown IDs return 200 with empty results.
  - `page` (body, integer, optional) – Defaults to 1. Must be ≥1; values below 1 return 422 and non-integers return 400.
  - `limit` (body, integer, optional) – Defaults to 5. Must be between 1 and 100 inclusive; out-of-range values return 422 and non-integers return 400.
  - `sort` (body, string, optional) – Defaults to `federal_account`. Allowed values: `federal_account`, `total_transaction_obligated_amount`, `agency`, `account_title`. Other inputs (including null) return 400.
  - `order` (body, string, optional) – Defaults to `desc`. Allowed values: `asc`, `desc` (case-sensitive). Any other input, including null, returns 400.

---

## How to interpret the response
- Root object with `results` and `page_metadata`.
- `results` is an array of account objects containing `total_transaction_obligated_amount`, `federal_account`, `account_title`, and funding agency metadata fields (`funding_agency_abbreviation`, `funding_agency_name`, `funding_agency_id`, `funding_toptier_agency_id`, `funding_agency_slug`). All fields were populated in observed responses.
- `page_metadata` provides `page`, `count`, `next`, `previous`, `hasNext`, and `hasPrevious`. Use these flags to drive pagination; the API returns `200` with empty `results` when you page past the data.

---

## Known doc mismatches
- Docs describe `page` and `limit` as generic numbers, but the API rejects non-integer inputs with 400 errors.

---

## Pitfalls & safe-usage checklist
- **Do:** Monitor `page_metadata.hasNext`/`hasPrevious` to know when to stop paginating.
- **Do:** Treat empty `results` with `200` as a valid response (e.g., unknown award IDs) and handle accordingly.
- **Don’t:** Send floats, strings, or null for `page`/`limit`; the API returns 400 for non-integers and 422 for out-of-range integers.
- **Don’t:** Change `order` without confirming the value is lowercase `asc` or `desc`; other casing (e.g., `ASC`) fails with 400.

---

## Runnable examples
```http
POST /api/v2/awards/accounts/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "award_id": "CONT_AWD_N0001917C0001_9700_-NONE-_-NONE-",
  "limit": 2,
  "page": 1,
  "sort": "total_transaction_obligated_amount",
  "order": "desc"
}
```

- Returns the top two funding accounts for the specified award, sorted by obligated amount (descending).
- Check `page_metadata.hasNext` to decide whether to request the next page.
