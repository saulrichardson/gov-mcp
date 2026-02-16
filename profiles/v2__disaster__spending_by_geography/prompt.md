# Disaster Spending By Geography – Semantic Guide

## What this endpoint does
Aggregates Disaster Emergency Fund (DEFC) spending totals by state, county, or congressional district. Results reflect the sums for the selected spending measure (obligation, outlay, or face value of loan) and can be scoped by recipient or place of performance geography.

---

## How to call it
- **Method & path:** `POST /api/v2/disaster/spending_by_geography/`
- **Auth:** None observed in probes.
- **Body parameters:**
  - `filter.def_codes` (body, array[string], required) – One or more uppercase DEFC codes; API rejects lowercase or unknown codes with HTTP 400.
  - `geo_layer` (body, string, required) – One of `state`, `county`, or `district`.
  - `spending_type` (body, string, required) – One of `obligation`, `outlay`, `face_value_of_loan`.
  - `scope` (body, string, optional) – `recipient_location` (default) or `place_of_performance`.
  - `geo_layer_filters` (body, array[string], optional) – Case-sensitive list of shape codes to include; invalid strings are ignored, and an empty array is rejected.
  - `filter.award_type_codes` (body, array[string], optional) – Limited to the documented award-type codes (A, B, C, D, 02–11, IDV_*).
  - `filter.time_period` (body, array[object], optional) – Date ranges with `start_date` and `end_date` (YYYY-MM-DD) and optional `date_type`.
  - `filter.recipient_scope` (body, string, optional) – Accepts `domestic` or `foreign`.
  - `filter.recipient_locations` (body, array[object], optional) – Standard location objects; `{ "country": "USA", "state": "CA" }` was accepted.

---

## How to interpret the response
- Returns a JSON object with `geo_layer`, `scope`, `spending_type`, and `results`.
- `results` is an array of objects containing `shape_code`, `display_name`, `amount`, `population`, `per_capita`, and `award_count` (all present but `shape_code`, `display_name`, `population`, and `per_capita` may be null).
- When no `geo_layer_filters` are sent, the first row often contains `shape_code: null` and aggregates totals that cannot be assigned to a specific geography.
- `results` can be empty when filters exclude all data; no pagination fields are returned.

---

## Known doc mismatches
- API documentation claims the request body is a plain string, but probes show it must be a JSON object with `filter`, `geo_layer`, and `spending_type` keys.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Confirm DEFC and shape codes are uppercase; lowercase values either error (DEFC) or silently drop (shape codes).
  - Budget for large payloads when requesting nationwide county or district aggregations; responses can exceed 100KB.
- **Don't:**
  - Don’t rely on geo-layer filters with alphanumeric county codes like `34LL` without retry logic; the server closed the connection during probes.
  - Don’t ignore HTTP 422 handling—missing required fields (e.g., empty `def_codes`) raise 422 rather than 400.

---

## Runnable example
```http
POST /api/v2/disaster/spending_by_geography/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": { "def_codes": ["L"] },
  "geo_layer": "state",
  "spending_type": "obligation"
}
```

- Returns `200 OK` with `scope: "recipient_location"` by default.
- `results` includes a row for each state plus a `shape_code: null` aggregate when no `geo_layer_filters` are supplied.
