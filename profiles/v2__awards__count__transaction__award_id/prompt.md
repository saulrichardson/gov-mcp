# Transaction Count – Semantic Guide

## What this endpoint does
Counts the transactions recorded against a specific USAspending generated_unique_award_id. Requests succeed only when the provided award ID matches an active record; otherwise the API returns a 404 JSON error. The endpoint powers the transaction history tab for an award detail page.

---

## How to call it
- **Method & path:** `GET /api/v2/awards/count/transaction/{award_id}/`
- **Auth:** None required in observed probes.
- **Parameters:**
  - `award_id` (path, string, required) – Use the exact generated_unique_award_id from a USAspending search/list API. Preserve case and include the trailing slash; invalid, stale, or truncated IDs return 404.

---

## How to interpret the response
- Response is a JSON object with a single field.
- `transactions` (integer) – Count of transactions tied to the award. Observed values include 2 and 22.

---

## Known doc mismatches
- Docs state that `ASST_NON_NNX17AJ96A_8000` returns 32 transactions, but the live API returns HTTP 404 `No Award found`.
- Documentation omits that unknown award IDs return HTTP 404 instead of a zero-count payload.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Fetch or cache generated_unique_award_id values from USAspending search endpoints before calling this count endpoint.
  - Preserve the original casing of `award_id` and send the trailing slash to avoid redirects or HTML 404s.
- **Don’t:**
  - Don’t assume an invalid award will return `{ "transactions": 0 }`; it fails with HTTP 404 instead.
  - Don’t change the HTTP method—non-GET requests return HTTP 405.

---

## Runnable examples
```http
GET /api/v2/awards/count/transaction/CONT_AWD_HC108424F0023_9700_N6600121A0083_9700/ HTTP/1.1
Host: api.usaspending.gov
```
```
{
  "transactions": 2
}
```

```http
GET /api/v2/awards/count/transaction/ASST_NON_NNX17AJ96A_8000/ HTTP/1.1
Host: api.usaspending.gov
```
```
{
  "detail": "No Award found with: 'ASST_NON_NNX17AJ96A_8000'"
}
```
