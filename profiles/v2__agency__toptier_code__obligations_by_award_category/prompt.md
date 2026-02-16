# v2/agency/obligations_by_award_category - Semantic Guide

## What this endpoint does
Returns a six-category breakdown of award obligations for the specified top-tier agency and fiscal year. Used by USAspending agency profile pages to populate obligation visualizations.

---

## How to call it
- **Method & path:** `GET /api/v2/agency/{toptier_code}/obligations_by_award_category/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `toptier_code` (path, string, required) - Digits-only identifier for the agency; observed valid lengths are 3-4. Unknown digit codes return JSON 404; non-numeric strings miss the route and produce HTML 404.
  - `fiscal_year` (query, integer, optional) - Accepts 2008-2026 inclusive. Omit or send an empty string to use the latest dataset (FY 2026 as of 2026-02-13). Non-integers return 400; out-of-range integers return 422 with bound messaging.

---

## How to interpret the response
- Root object contains `total_aggregated_amount` (number) and `results` (array).
- `results` always holds six objects in the fixed order: contracts, direct_payments, grants, idvs, loans, other.
- Each result object reports `category` (string) and `aggregated_amount` (number). Amounts can be zero or negative (loans frequently adjust downward).
- `total_aggregated_amount` matches the sum of the six category values; observed totals are zero or positive depending on agency data.

---

## Known doc mismatches
- Documentation claims the array is sorted by descending amount, but the live API preserves the fixed category order.
- Documentation claims zero-dollar categories are omitted, yet the API always returns all six categories with their values (including zeros and negatives).

---

## Pitfalls & safe-usage checklist
- **Do:** Validate `fiscal_year` against the published min/max and handle future expansions gracefully.
- **Do:** Tolerate negative category amounts, especially for `loans` adjustments.
- **Don't:** Assume error payloads are always JSON; non-numeric `toptier_code` values trigger an HTML 404 page.

---

## Runnable example
```http
GET /api/v2/agency/086/obligations_by_award_category/?fiscal_year=2023 HTTP/1.1
Host: api.usaspending.gov
```

- Returns FY 2023 totals for agency 086 with all six category entries.
- Example loans subtotal: `-5321003112.75`, so ingest pipelines must accept negative numbers.
