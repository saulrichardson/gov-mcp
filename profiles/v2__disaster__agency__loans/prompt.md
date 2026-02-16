# Disaster Loan Agencies – Semantic Guide

## What this endpoint does

Returns aggregated disaster/emergency loan metrics grouped by toptier agency. When loan award types are supplied, the payload can include subtier agency breakdowns and warning messages about sorting.

---

## How to call it

- **Method & path:** `POST /api/v2/disaster/agency/loans/`
- **Auth:** Not required in observed probes.
- **Body fields:**
  - `filter.def_codes` (array[string], required) – Provide one or more valid DEFC codes; invalid codes trigger HTTP 400, and empty arrays return HTTP 422.
  - `filter.award_type_codes` (array[string], optional) – Restrict to loan types `'07'` and/or `'08'`; any other value returns HTTP 400 and the response may include subtier children plus a sort warning.
  - `filter.query` (string, optional) – Keyword matcher for agencies, but only safe when paired with loan award types. Empty strings return HTTP 422 and omitting award types produces an HTML 500.
  - `pagination.limit` (integer, optional) – Page size, 1–100 inclusive; values outside the range return HTTP 422. Defaults to 10.
  - `pagination.page` (integer, optional) – 1-based page index; `0` returns HTTP 422, larger values succeed with empty `results` once data is exhausted. Defaults to 1.
  - `pagination.sort` (string, optional) – One of `id`, `code`, `description`, `award_count`, `obligation`, `outlay`, `face_value_of_loan`. Sorting on `id` falls back to description ordering and raises a warning. Defaults to `id` (effective behavior is description).
  - `pagination.order` (string, optional) – `'asc'` or `'desc'`; other values return HTTP 400. Defaults to `desc`.
  - `spending_type` (string, optional) – Accepted but inert; no observed impact on totals.

---

## How to interpret the response

- Root object contains `totals`, `results`, and `page_metadata`; `messages` appears when the API issues warnings.
- `totals` aggregates award_count, obligation, outlay, and face_value_of_loan across all matched agencies.
- `results` is an array of agencies; each item has numeric `id`, `code`, `description`, loan metrics, and a `children` array (populated when loan award types are supplied).
- `page_metadata.total` is the count of matched agencies (not the page count), with nullable `next`/`previous` pointers and boolean `hasNext`/`hasPrevious` flags.
- `messages` currently warns that `sort: id` is not implemented and results were sorted by description.

---

## Known doc mismatches

- Result objects return numeric `id` values, contradicting the documentation’s string type.
- The docs present `query` as a generic optional string, but the live API returns an HTML 500 unless loan award types are present.
- Documentation claims `sort: id` works normally, yet the API falls back to description ordering and issues a warning message.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate DEFC and loan award type codes client-side to avoid 400 responses.
  - Pair any `query` usage with `'07'`/`'08'` award types and handle possible empty result sets.
  - Monitor the `messages` array for sorting fallbacks or other warnings.
  - Implement retries or IPv4 fallback to recover from intermittent connection resets.
- **Don’t:**
  - Don’t rely on IPv6-only connectivity; initial IPv6 attempts closed the connection.
  - Don’t assume `spending_type` changes the aggregation; treat it as informational only.
  - Don’t depend on strict `id` ordering without verifying the returned sequence.

---

## Runnable example

```http
POST /api/v2/disaster/agency/loans/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": {
    "def_codes": ["L", "M", "N", "O", "P", "U"],
    "award_type_codes": ["07"],
    "query": "Small"
  },
  "pagination": {
    "limit": 1
  }
}
```

- Returns HTTP 200 with empty `results`, zeroed `totals`, and a `messages` warning about `sort: id`.
- Use `page_metadata.hasNext`/`hasPrevious` to paginate additional agencies when they exist.
