# Sub-Agency Rollup – Semantic Guide

## What this endpoint does
Returns aggregated award obligations, transaction counts, and new-award counts for each sub-agency under a specified toptier agency. Includes optional award-type filtering, funding vs. awarding viewpoints, and office-level child rollups when data exists. Pagination metadata accompanies every response.

---

## How to call it
- **Method & path:** `GET /api/v2/agency/{toptier_code}/sub_agency/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `toptier_code` (path, string, required) – 3–4 digit numeric CGAC/FREC; bad codes return JSON 404, non-numeric hits HTML 404.
  - `fiscal_year` (query, integer, optional) – Defaults to 2026; valid range 2008–2026; out-of-range triggers 422, non-integer triggers 400.
  - `agency_type` (query, string, optional) – `awarding` (default) or `funding`.
  - `award_type_codes` (query, array, optional) – Repeatable filter accepting `02`, `03`, …, `IDV_E` plus sentinels `-1` and `no intersection` (both yield empty results); invalid values return 400.
  - `sort` (query, string, optional) – One of `name`, `total_obligations`, `transaction_count`, `new_award_count`; defaults to `total_obligations`.
  - `order` (query, string, optional) – `desc` (default) or `asc`.
  - `page` (query, integer, optional) – Minimum 1; defaults to 1; <1 rejected with 422; non-integer rejected with 400.
  - `limit` (query, integer, optional) – 1–100; defaults to 10; outside range yields 422; non-integer rejected with 400.

---

## How to interpret the response
- Responses are JSON objects containing `toptier_code`, `fiscal_year`, `page_metadata`, `results`, and `messages`.
- `page_metadata.total` is the total number of matching sub-agency records (not pages); `page` echoes your request even if `results` is empty.
- `results` is an array of sub-agency aggregates; each entry carries `total_obligations`, `transaction_count`, `new_award_count`, and a `children` array.
- `children` is always present but may be empty; office `name` fields can be `null`, especially for older DATA Act records; obligations may be negative.
- `messages` usually empty but can include warnings (e.g., FY 2008 DATA Act coverage disclaimer).

---

## Known doc mismatches
- Documentation describes Federal/Treasury account listings, but the live API returns sub-agency award aggregates with office children.
- Docs imply office child names are always populated; probes show `null` names for historical records.
- Sentinel award type codes `-1` and `no intersection` are accepted despite not being documented.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Set `limit` and iterate with `page` to control payload size and children volume.
  - Inspect `messages` for disclaimers, especially when querying older fiscal years.
  - Guard against negative obligations and optional/null office detail fields in downstream processing.
- **Don’t:**
  - Don’t assume every toptier code returns JSON; handle HTML 404s and 503s gracefully.
  - Don’t rely on undocumented award type behavior beyond the observed sentinel values.

---

## Runnable examples
```http
GET /api/v2/agency/086/sub_agency/?limit=2&page=2 HTTP/1.1
Host: api.usaspending.gov
```
- Returns HUD sub-agency page 2 data with `page_metadata.next = 3` and `hasNext = true`.
- `results` contains two sub-agencies with their office children arrays and aggregate counts.
- `messages` is empty when querying recent fiscal years.
