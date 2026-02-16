# Recipient Spending Disaster/Emergency Funding – Semantic Guide

## What this endpoint does
Aggregates supplemental disaster/emergency spending by recipient based on the provided DEFC list, returning totals plus a paginated recipient breakdown. Supports optional sorting, award-type filtering, and keyword search against recipient text fields.

---

## How to call it
- **Method & path:** `POST /api/v2/disaster/recipient/spending/`
- **Auth:** Not required in observed probes.
- **Body parameters:**
  - `filter.def_codes` (array[string], required) – at least one uppercase DEFC value; invalid codes return 400, empty arrays return 422.
  - `filter.award_type_codes` (array[string], optional) – restricts results to the documented award-type set; empty arrays return 422.
  - `filter.query` (string, optional) – non-empty keyword; empty string returns 422; unmatched terms return 200 with zero totals.
  - `filter.time_period` (array[object], optional) – accepted but ignored; include only if you can tolerate unchanged totals.
  - `pagination.limit` (integer, optional) – 1–100 inclusive; numeric strings are coerced; out-of-range or non-integers fail validation.
  - `pagination.page` (integer, optional) – minimum 1; empty pages surface `results: []` with accurate metadata.
  - `pagination.sort` (string, optional) – choose from `award_count`, `description`, `code`, `id`, `obligation`, `outlay`; default `id` falls back to `description` with a warning.
  - `pagination.order` (string, optional) – `asc` or `desc`.
  - `spending_type` (string, optional) – observed values `total`, `obligation`, `outlay`, `award_count`; other values silently revert to `total`.

---

## How to interpret the response
- Returns an object with `totals`, `results`, and `page_metadata`; `messages` appears only when warnings (e.g., sort fallback) are emitted.
- `totals` holds overall obligation, outlay, and award_count sums for the current filter set.
- `results` is the paginated recipient list; each row provides `code`, `description`, award/activity metrics, and an `id` array when concrete awards are present. In `award_count` mode some aggregate buckets report `id: null`.
- `page_metadata` mirrors the requested pagination and reports `total`, `next`/`previous`, and boolean flags.
- An empty match returns zero totals and no results while still including `page_metadata` (and possibly a warning message if you did not override the default sort).

---

## Known doc mismatches
- Documentation claims `results.id` is always an array, but award-count responses return `null` for aggregated recipients.
- Docs only list `description`, `award_count`, `obligation`, and `outlay` as sort options; the API also accepts `code` and `id`, though `id` is unimplemented and falls back to `description`.
- The published contract omits the `spending_type` parameter even though the API accepts `total`, `obligation`, `outlay`, and `award_count`.
- Shared filter docs suggest `time_period` constrains data, yet observed calls ignore the supplied ranges.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Always supply a valid `filter.def_codes` array before anything else.
  - Set an explicit `pagination.sort` whenever you want deterministic ordering and to suppress warning messages.
  - Validate pagination inputs on the client (limit range, positive page) before sending the request.
- **Don’t:**
  - Don’t rely on `time_period` to narrow the dataset; treat it as a no-op until the backend changes.
  - Don’t assume `results.id` is populated; handle `null` when using `spending_type='award_count'`.
  - Don’t trust silent fallbacks on `spending_type`; confirm the value you send matches one of the observed options.

---

## Runnable examples
```http
POST /api/v2/disaster/recipient/spending/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": {
    "def_codes": ["L"],
    "query": "zzzzzzzzz"
  },
  "pagination": {
    "limit": 5
  }
}
```

- Returns zeroed `totals`, an empty `results` array, and a warning message explaining that the backend fell back from `sort="id"` to `description`.
