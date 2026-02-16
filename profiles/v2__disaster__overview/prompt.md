# Disaster Spending Overview – Semantic Guide

## What this endpoint does
Summarizes disaster-related budget authority and spending for the DEFC codes you specify. Returns per-code funding totals plus aggregate obligation/outlay metrics, with an optional rollup for related amounts lacking DEFC labels.

---

## How to call it
- **Method & path:** `GET /api/v2/disaster/overview/`
- **Auth:** None required in observed probes.
- **Parameters:**
  - `def_codes` (query, string, required) – Comma-separated DEFC tokens (numeric or uppercase strings). Provide at least one token; blank strings return 422 and omitting the parameter times out. Trim each token yourself—internal spaces or lowercase letters silently drop matches. Invalid tokens are ignored without errors.

---

## How to interpret the response
- Response is a JSON object with `funding`, `total_budget_authority`, `spending`, and `additional`.
- `funding` lists `{def_code, amount}` pairs only for codes with non-zero totals; order is not stable and amounts may be negative.
- `total_budget_authority` equals the sum of `funding.amount` values.
- `spending` always includes numeric `award_obligations`, `award_outlays`, `total_obligations`, and `total_outlays`; values can be zero or internally inconsistent.
- `additional` toggles between `null` and an object containing its own `total_budget_authority` plus `spending.total_obligations`/`total_outlays` when related unlabeled amounts exist.

---

## Known doc mismatches
- Docs describe `def_codes` as an optional array, but live traffic requires a single comma-separated string and omitting it yields a 504 timeout.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Implement retries with backoff for first-time or broad requests; uncached calls often 504 before succeeding on retry.
  - Normalize tokens (uppercase, trim per-token whitespace) before sending to avoid silent drops.
- **Don't:**
  - Don’t rely on `funding` ordering; it neither mirrors input order nor sorts by amount.
  - Don’t assume `additional` persists—always handle both `null` and object cases.

---

## Runnable examples
```http
GET /api/v2/disaster/overview/?def_codes=V HTTP/1.1
Host: api.usaspending.gov
```

- Returns populated `funding` for `V` and an `additional` object with unlabeled totals.
- Expect `spending` to include all four obligation/outlay metrics even when `funding` contains a single entry.
