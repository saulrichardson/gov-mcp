# Treasury Account Program Activities – Semantic Guide

## What this endpoint does
Returns aggregated program activity totals and their object class breakdowns for a Treasury Account Symbol (TAS) in a specific fiscal year. The service echoes the TAS and fiscal year and supports pagination over program activities.

---

## How to call it
- **Method & path:** `GET /api/v2/agency/treasury_account/{tas}/program_activity/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `tas` (path, string, required) – Treasury Account Symbol; case-sensitive; unknown values succeed with empty data.
  - `fiscal_year` (query, integer, optional) – Defaults to current FY (2026 observed). Allowed range 2008–current; <2008 or >current returns 422; non-integers return 400. FYs before 2017 yield empty results plus a warning message.
  - `filter` (query, string, optional) – Documented object-class text filter, but any value currently empties the result set.
  - `sort` (query, string, optional) – One of `name`, `obligated_amount`, `gross_outlay_amount`; default `obligated_amount`. `type` is rejected (400).
  - `order` (query, string, optional) – `asc` or `desc` (default); case-sensitive.
  - `page` (query, integer, optional) – 1-based; defaults to 1. Out-of-range pages return 200 with empty `results` and echoed `page` value.
  - `limit` (query, integer, optional) – Page size 1–100 (default 10). Outside range triggers 422; non-integers trigger 400.

---

## How to interpret the response
- Returns an object with `treasury_account_symbol`, `fiscal_year`, `page_metadata`, `results`, and `messages`.
- `page_metadata` reports pagination state (`page`, `total`, `limit`, `next`, `previous`, `hasNext`, `hasPrevious`); these values echo request inputs even on empty pages.
- `results` is an array of program activities containing `name`, `obligated_amount`, `gross_outlay_amount`, `type` (observed `PARK` or `PAC/PAN`), and `children` arrays of object-class rollups (which may include negative amounts).
- `messages` is an array of warning strings; populated when data are unavailable (e.g., requests for FY2008 returned a DATA Act availability warning).

---

## Known doc mismatches
- Docs list `type` as a valid `sort` option, but the API rejects it with 400.
- Docs describe `filter` as narrowing object classes by name, yet every tested value produced empty results.

---

## Pitfalls & safe-usage checklist
- **Do:** Inspect `results` and `page_metadata.total` to confirm data were returned, especially after applying pagination or unknown TAS values.
- **Do:** Surface any `messages` warnings to users when fiscal_year precedes 2017.
- **Do:** Validate user inputs and map 400 vs 422 errors to actionable feedback.
- **Don’t:** Rely on the `filter` parameter until the service restores functional behavior.
- **Don’t:** Assume larger pages are available; enforce the 1–100 `limit` bounds client-side.

---

## Runnable example
```http
GET /api/v2/agency/treasury_account/075-X-0512-000/program_activity/?limit=2 HTTP/1.1
Host: api.usaspending.gov
```

- Returns FY2026 program activities for TAS `075-X-0512-000` with `limit=2`.
- `results` includes the first two activities; `page_metadata.next` points to page 2 while `total`=3.
- `messages` is empty when data are present for the requested year.
