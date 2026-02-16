# List Budget Functions – Semantic Guide

## What this endpoint does
Returns the agency-wide catalog of budget functions as a single JSON list. Observed payloads contain 20 entries sorted alphabetically by title and include each function’s code and human-readable name.

---

## How to call it
- **Method & path:** `GET /api/v2/budget_functions/list_budget_functions/`
- **Auth:** None observed in probes.
- **Headers:** Include `Accept: application/json`; XML-only Accept headers returned HTTP 406.
- **Parameters:** None required or documented. Extra query keys are ignored, but `format=csv` triggered HTTP 404.

---

## How to interpret the response
- Top-level object with a single `results` array.
- Each array item provides `budget_function_code` (three-digit string) and `budget_function_title` (string name).
- No pagination metadata was present; every successful call returned the full list.

---

## Known doc mismatches
- None observed.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Keep requests simple and omit the `format` query key to avoid HTTP 404.
  - Send an `Accept` header that includes `application/json`.
- **Don’t:**
  - Don’t assume the catalog size is constant; handle potential changes in the number of results.
  - Don’t expect server-side filtering or pagination based on query parameters.

---

## Runnable examples
```http
GET /api/v2/budget_functions/list_budget_functions/ HTTP/1.1
Host: api.usaspending.gov
Accept: application/json
```

*Returns the full budget function list as a JSON array under `results`.*
