# v2/financial_balances/agencies – Semantic Guide

## What this endpoint does
Returns aggregated budget authority, obligations, and outlays for a single funding agency in a specific fiscal year. Every response includes pagination metadata even though only one balance record has been observed per request.

---

## How to call it
- **Method & path:** `GET /api/v2/financial_balances/agencies/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `fiscal_year` (query, string, required) – digits for the fiscal year; non-numeric or decimal strings trigger 500 HTML errors.
  - `funding_agency_id` (query, string, required) – digits matching a USAspending funding agency; zero/negative/unknown IDs return 200 with empty results.
  - `limit` (query, string, optional, default 100) – values <1 are coerced to 1; values >500 are capped at 500; non-numeric values trigger 500 errors.
  - `page` (query, string, optional, default 1) – values <1 are normalized to 1; non-numeric or decimal strings trigger 500 errors; high pages return empty results while count stays unchanged.

---

## How to interpret the response
- Top-level object containing `page_metadata` and `results`.
- `page_metadata` includes `count`, `page`, `has_next_page`, `has_previous_page`, and navigation URLs (`current`, `previous`, `next`). Requests for pages beyond the data may set `has_previous_page` true even when `count` is 0.
- `results` is an array with zero or one balance object. Each balance object exposes `budget_authority_amount`, `obligated_amount`, and `outlay_amount` as stringified decimals.

---

## Known doc mismatches
- Documentation omits the required `page_metadata` object even though the endpoint always returns it.
- Documentation implies numeric validation, but malformed numeric inputs produce 500 HTML responses instead of JSON errors.

---

## Pitfalls & safe-usage checklist
- **Do:** Validate query values as digit-only strings before sending to avoid HTML 500s.
- **Do:** Treat empty `results` with `count` 0 or 1 as possible bad identifiers and surface that to users.
- **Do:** Guard pagination logic against `has_previous_page` being true when no data exists.
- **Don’t:** Depend on server-side defaults for `limit`; set it explicitly if you need deterministic pagination.
- **Don’t:** Assume multiple balance rows will be returned; handle the array defensively even though only one row has been observed.

---

## Runnable examples
```http
GET /api/v2/financial_balances/agencies/?fiscal_year=2023&funding_agency_id=12 HTTP/1.1
Host: api.usaspending.gov
```

- Returns one balance record for agency `12` in fiscal year `2023`.
- `page_metadata.count` is `1`, `has_next_page` and `has_previous_page` are `false`.
- `results[0]` contains stringified totals for budget authority, obligations, and outlays.
