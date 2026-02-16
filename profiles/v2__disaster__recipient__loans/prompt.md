# Disaster Recipient Loans – Semantic Guide

## What this endpoint does

Aggregates supplemental disaster loan spending by recipient for the DEFC codes you specify. Returns both overall totals and per-recipient loan metrics with standard pagination metadata.

---

## How to call it

- **Method & path:** `POST /api/v2/disaster/recipient/loans/`
- **Auth:** None required in observed probes.
- **Body parameters (JSON):**
  - `filter` (object, required, body) – must include `def_codes` array (values from the published DEFC list). Optional keys:
    - `award_type_codes` (array) – only `'07'` and/or `'08'`; empty arrays or other codes fail validation.
    - `query` (string|null) – non-empty text narrows recipients by keyword; `null` behaves like no keyword.
  - `pagination` (object, optional, body) – controls result slicing:
    - `page` (integer ≥1) – defaults to 1; zero or non-integers are rejected.
    - `limit` (integer 1–100) – defaults to 10; values outside the range or non-integers fail.
    - `sort` (string) – choose one of `award_count`, `description`, `code`, `id`, `obligation`, `outlay`, `face_value_of_loan`. Omitting or choosing `id` triggers a warning and the response is sorted by `description`.
    - `order` (string) – lowercase `asc` or `desc`; other casings (e.g., `ASC`) fail.
  - `spending_type` (string|null, optional) – accepted but ignored; include only if a client contract demands it.

---

## How to interpret the response

- Top-level JSON object with `totals`, `results`, optional `messages`, and `page_metadata`.
- `totals` reports aggregate `obligation`, `outlay`, `face_value_of_loan`, and `award_count` (note: for DEFC Q, the total `award_count` stayed 0 despite row-level counts).
- `results` is an array; each recipient contains `id` (list of contributing award identifiers with `-R`/`-C` suffixes), `code`, `description`, `award_count`, `obligation`, `outlay`, and `face_value_of_loan`.
- `page_metadata` includes `page`, `limit`, `total`, `next`, `previous`, `hasNext`, `hasPrevious`; observed `total` caps at 10 000 even when more recipients likely exist.
- `messages` appears when the backend issues warnings (e.g., sort fallbacks); treat as informational alerts that sorting did not follow the request exactly.

---

## Known doc mismatches

- Docs spell the totals field as `face_value_of_laon` and imply string values; API returns numeric `face_value_of_loan`.
- Docs list fewer sort fields; the API also accepts `code` and `id` (with `id` emitting a warning and falling back to description sorting).
- Docs claim the default sort is `description`, but the backend attempts `id` and falls back with a warning when no sort is provided.

---

## Pitfalls & safe-usage checklist

- **Do:** Explicitly choose a supported `sort` value (`obligation`, `outlay`, etc.) to avoid fallback warnings.
- **Do:** Re-sort client-side if you rely on alphabetical ordering; string sorts (`description`, `code`) returned unsorted data in probes.
- **Do:** Monitor `totals.award_count` against row-level counts; reconcile discrepancies before surfacing aggregates.
- **Don’t:** Expect to page beyond 10 000 recipients without refining filters; the backend caps `page_metadata.total` at that ceiling.

---

## Runnable example

```http
POST /api/v2/disaster/recipient/loans/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": {
    "def_codes": ["N"]
  },
  "pagination": {
    "limit": 5,
    "sort": "obligation",
    "order": "desc"
  }
}
```

- Returns the highest-obligation disaster loan recipients for DEFC N.
- Response includes a warning array only if the backend falls back from an unsupported sort.
- Iterate `page` to traverse additional slices; stop when `hasNext` becomes `false`.
