# Disaster Agency Spending – Semantic Guide

## What this endpoint does

Aggregates disaster and emergency funding by agency. Supports totals across all budgetary resources or award-linked spending only, with optional award-type narrowing and pagination.

---

## How to call it

- **Method & path:** `POST /api/v2/disaster/agency/spending/`
- **Auth:** Not required in observed probes.
- **Body parameters:**
  - `filter.def_codes` (array[string], required) – supply at least one valid DEFC code; invalid or empty arrays return HTTP 400/422.
  - `filter.award_type_codes` (array[string], optional) – non-empty list from `['-1','02','03','04','05','06','07','08','09','10','11','A','B','C','D','IDV_A','IDV_B','IDV_B_A','IDV_B_B','IDV_B_C','IDV_C','IDV_D','IDV_E']`; ignored for `spending_type='total'` but enables child agencies for award views.
  - `filter.query` (string, optional) – arbitrary keyword string; only affects `spending_type='award'`.
  - `spending_type` (string, required) – `'total'` or `'award'`; other values return HTTP 400.
  - `pagination.limit` (integer, optional) – between 1 and 100 inclusive; outside that range returns HTTP 422.
  - `pagination.page` (integer, optional) – minimum value 1; zero returns HTTP 422.
  - `pagination.sort` (string, optional) – for total view: `id|code|description|award_count|total_budgetary_resources|obligation|outlay`; for award view: `id|code|description|award_count|obligation|outlay`. Requesting an unsupported field returns HTTP 400.
  - `pagination.order` (string, optional) – `'asc'` or `'desc'`; other inputs return HTTP 400.
  - Other shared filters (e.g., `time_period`, `agencies`) are accepted but ignored; do not rely on them.

---

## How to interpret the response

- Returns an object containing `totals`, `results`, `page_metadata`, and optionally `messages`.
- `totals` always includes numeric `obligation` and `outlay`; `total_budgetary_resources` appears only when `spending_type='total'`, while `award_count` appears only for `'award'`.
- `results` is an array of agencies. Each item supplies `id` (integer or null), `code`, `description`, spending figures, and a `children` array (empty unless `award_type_codes` were provided). Award responses leave `total_budgetary_resources` null and may include nested children without that field.
- `page_metadata` provides `page`, `total`, `limit`, `next`, `previous`, `hasNext`, and `hasPrevious`. Empty pages still convey accurate `total` counts.
- `messages` appears when the backend falls back from a requested sort (e.g., sorting award data by `id` or `code`). Treat the warning as authoritative about the actual ordering.

---

## Known doc mismatches

- Responses return integer-or-null `id` values despite documentation declaring strings.
- `filter.query` is ignored for total spending even though docs imply universal keyword filtering.
- Docs restrict `award_type_codes` to award view, however the API accepts them during total requests without complaints.
- Child results omit `total_budgetary_resources`, contrary to the documented schema.
- Award view rejects `total_budgetary_resources` as a sort option despite documentation listing it.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Confirm `messages` is empty before assuming the requested sort was honored.
  - Treat `id` as optional; fall back to `code` or `description` when building keys.
  - Paginate with explicit `limit`/`page` when expecting large result sets.
- **Don’t:**
  - Don’t rely on keyword or shared filters when using `spending_type='total'`; they are ignored.
  - Don’t assume spending figures are all positive—award aggregates can be negative.
  - Don’t expect structured error payloads; handle plain-string `detail` responses for 400/422 errors.

---

## Runnable example

```http
POST /api/v2/disaster/agency/spending/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": {
    "def_codes": ["L"],
    "award_type_codes": ["A", "B"]
  },
  "spending_type": "award",
  "pagination": {
    "limit": 2,
    "sort": "code"
  }
}
```

- Returns agencies receiving award-linked disaster funding, including nested child agencies.
- `messages` warns that unsupported sorts (e.g., `code` for this combination) fall back to description ordering.
- Iterate `page_metadata.next` to traverse remaining agencies.
