# Object Class Disaster Spending - Semantic Guide

## What this endpoint does

Returns aggregated disaster/emergency spending grouped by parent object class, including obligation/outlay totals and, when requested, award counts. Results require DEFC filters and reflect supplemental funding drawn from USAspending disaster datasets.

---

## How to call it

- **Method & path:** `POST /api/v2/disaster/object_class/spending/`
- **Host:** `api.usaspending.gov`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `filter` (body, object, required) - container for disaster search filters; must include `def_codes`.
  - `filter.def_codes` (body, array[string], required) - uppercase DEFC values such as `"L"`, `"M"`, `"QQQ"`; array length must be >= 1 or the API returns 422/400.
  - `filter.query` (body, string, optional) - must be non-empty if provided; accepted strings did not change results.
  - `filter.award_type_codes` (body, array[string] or string, optional) - accepted but ignored; even bogus values leave aggregates unchanged.
  - `filter.time_period` (body, array[object], optional) - accepted start/end ranges but observed totals matched the no-filter baseline.
  - `spending_type` (body, string, required) - `"total"` for all resources or `"award"` for award-only metrics; other values return 400.
  - `pagination.limit` (body, integer/string, optional) - page size 1-100; outside this range returns 422.
  - `pagination.page` (body, integer/string, optional) - 1-based page index; out-of-range pages return empty `results` while keeping totals.
  - `pagination.sort` (body, string, optional) - one of `id`, `code`, `description`, `award_count`, `obligation`, `outlay`, `total_budgetary_resources`; invalid values return 400.
  - `pagination.order` (body, string, optional) - `asc` or `desc` only.

---

## How to interpret the response

- Response is an object with `results`, `page_metadata`, and `totals`.
- `results` lists parent object classes with `id`, `code`, `description`, `award_count`, `obligation`, `outlay`, and `children` (recursive shape). `award_count` is null when `spending_type="total"`.
- `page_metadata` reports `page`, `limit`, `total`, `next`, `previous`, `hasNext`, `hasPrevious`; flags reflect pagination accurately, even on empty pages.
- `totals` contains overall obligations/outlays for the filter set and includes `award_count` only when `spending_type="award"`. Totals persist even when `results` is empty.

---

## Known doc mismatches

- `filter.query` is documented as a keyword filter, but observed responses were unchanged for different strings and only blank values error.
- Docs enforce an enum for `filter.award_type_codes`, yet the API accepts arbitrary values (arrays or strings) without effect.
- Documentation omits the `total_budgetary_resources` sort option that the API accepts.
- Docs imply `filter.time_period` constrains data, but observed totals match the baseline regardless of range.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Supply both `filter.def_codes` and `spending_type` on every request.
  - Handle null `award_count` values when requesting `spending_type="total"`.
  - Check `totals` even if `results` is empty, since pagination beyond the data retains aggregate values.
- **Don't:**
  - Assume `filter.award_type_codes` or `filter.query` will filter results without verifying in your environment.
  - Treat an empty `results` array as proof of zero spending; consult `totals` before drawing conclusions.
  - Rely on `filter.time_period` to narrow the dataset until the API behavior changes.

---

## Runnable examples

```http
POST /api/v2/disaster/object_class/spending/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": {
    "def_codes": ["L"]
  },
  "spending_type": "total",
  "pagination": {
    "limit": 2,
    "page": 1
  }
}
```

- Returns the top two object classes for DEFC `L` with `hasNext=true` and totals of `obligation: 7210622269.71`, `outlay: 6953937862.19`.
- `award_count` fields are null because the request used `spending_type="total"`.
