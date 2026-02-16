# Federal Account Loans – Semantic Guide

## What this endpoint does
Aggregates disaster and emergency loan spending by federal account for the supplied Disaster Emergency Fund (DEF) codes. Returns overall totals plus per-account rollups, with optional case-insensitive keyword filtering.

---

## How to call it
- **Method & path:** `POST /api/v2/disaster/federal_account/loans/`
- **Auth:** Not required in observed probes.
- **Body fields:**
  - `filter.def_codes` (array[string], required) – One or more valid DEF codes; invalid or empty submissions fail with 400/422.
  - `filter.query` (string, optional) – Non-empty text matched case-insensitively against account labels; empty or non-text inputs are rejected.
  - `filter.time_period` (array|object|string, optional) – Accepted but ignored; use only if you can verify downstream handling.
  - `pagination.limit` (integer ≥ 1, optional) – Reflected in `page_metadata` but does not limit returned rows; 0, negative, or null inputs error.
  - `pagination.page` (integer ≥ 1, optional) – Updates metadata only; actual results remain unchanged.
  - `pagination.order` ("asc"|"desc", optional) – Controls sort direction when used with `pagination.sort`.
  - `pagination.sort` (enum, optional) – One of `id`, `code`, `description`, `award_count`, `obligation`, `outlay`, `face_value_of_loan`; default behavior sorts by `code` descending.
  - `spending_type` (string, optional) – Accepted but currently inert; observed outputs do not change.

---

## How to interpret the response
- Top-level object with `totals`, `results`, and `page_metadata`.
- `totals` supplies aggregate `award_count`, `obligation`, `outlay`, and `face_value_of_loan` across all matches; zeros indicate no data.
- `results` is an array of federal account entries containing integer `id`, string `code`, `description`, monetary totals, and a `children` array of treasury account rollups (each with at least `id` and `code`).
- `page_metadata` echoes the requested pagination values (`page`, `limit`, `order`, etc.) and signals additional pages via `hasNext`/`next`, but the dataset itself is not sliced.

---

## Known doc mismatches
- Response `id` fields are integers, contrary to the documentation’s string claim.
- Metadata pagination settings do not reduce the returned result set despite the docs stating they do.
- Default ordering is by `code` descending, not `id` as documented.
- The accepted DEF code list extends beyond the CARES codes referenced in the docs (e.g., numeric codes, `AAA`, `QQQ`).

---

## Pitfalls & safe-usage checklist
- **Do:** Validate DEF code inputs client-side to surface errors before calling the API.
- **Do:** Treat `pagination` metadata as descriptive only; implement any slicing on the client if you need paging.
- **Don’t:** Assume optional filters like `time_period` or `spending_type` will constrain results without verifying in your environment.
- **Don’t:** Ignore large numeric range requirements—parse monetary fields with high-precision types.

---

## Runnable examples
```http
POST /api/v2/disaster/federal_account/loans/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": {
    "def_codes": ["L", "M", "N", "O", "P", "U"],
    "query": "business loans"
  },
  "pagination": {
    "sort": "obligation",
    "order": "desc",
    "limit": 10
  }
}
```

- Returns aggregated totals for matching federal accounts and the full `results` array irrespective of the requested limit.
- `results[0].children` lists treasury accounts contributing to the federal account rollup.
- `page_metadata` mirrors the provided pagination values even though all rows are returned in one payload.
