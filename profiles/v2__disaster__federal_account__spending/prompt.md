# Federal Account Spending – Semantic Guide

## What this endpoint does
Aggregates disaster and emergency funding using the supplied DEFC codes, returning federal account rows with nested TAS details. Totals, account metrics, and pagination metadata are computed server-side for both total-resource and award-only spending modes.

---

## How to call it
- **Method & path:** `POST /api/v2/disaster/federal_account/spending/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `filter.def_codes` (body, array[string], required) – uppercase DEFC codes from the server allowlist; min 1 item; lowercase or unrecognized codes return 400/422.
  - `filter.query` (body, string, optional) – accepted but ignored in all observed responses; do not rely on it for filtering.
  - `spending_type` (body, string, required) – `total` for budgetary totals, `award` for award-derived values; other values return 400.
  - `pagination.page` (body, integer, optional, default 1) – must be ≥1; decimals trigger 400, zero/negatives trigger 422.
  - `pagination.limit` (body, integer, optional, default 10) – range 1–100; values outside this range return 422.
  - `pagination.sort` (body, string, optional, default `id`) – one of `id`, `code`, `description`, `award_count`, `obligation`, `outlay`, `total_budgetary_resources`; invalid options return 400.
  - `pagination.order` (body, string, optional, default `desc`) – `asc` or `desc`; invalid options return 400. Numeric strings are coerced, but non-integer numbers are rejected.

---

## How to interpret the response
- Root object contains `results`, `page_metadata`, and `totals`.
- `results` is a list of federal accounts; each row has nested `children` TAS entries sharing the same fields (`id`, `code`, `description`, `award_count`, `obligation`, `outlay`, `total_budgetary_resources`).
- Mode-dependent nulls: in `total` mode `award_count` is null while `total_budgetary_resources` is numeric; in `award` mode the reverse is true. Obligation/outlay values may be negative in award mode.
- `page_metadata` reports paging state (`page`, `total`, `limit`, `next`, `previous`, `hasNext`, `hasPrevious`). Empty pages still echo the original `total`.
- `totals` aggregates obligation/outlay across the full filtered dataset and toggles `award_count`/`total_budgetary_resources` fields based on `spending_type`.

---

## Known doc mismatches
- `filter.query` is documented as a keyword filter but every probe returned identical data, indicating it is ignored by the service.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Validate and upper-case DEFC codes before sending to avoid 400 errors.
  - Guard client code against null `award_count` or `total_budgetary_resources` depending on `spending_type`.
  - Clamp `page`/`limit` to integers within the accepted ranges to prevent request failures.
- **Don’t:**
  - Don’t depend on `filter.query` for server-side filtering until the backend behavior changes.
  - Don’t assume pagination errors fall back silently; the service rejects invalid values with 400/422 responses.

---

## Runnable example
```http
POST /api/v2/disaster/federal_account/spending/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": { "def_codes": ["L"] },
  "spending_type": "total",
  "pagination": { "limit": 2 }
}
```
- Returns federal accounts receiving DEFC `L` funding with nested TAS rows.
- `totals.total_budgetary_resources` is populated in `total` mode, and `results[*].award_count` is null.
- Pagination metadata shows `total` matches even when individual pages are exhausted.
