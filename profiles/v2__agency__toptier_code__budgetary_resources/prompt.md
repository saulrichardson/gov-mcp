# Agency Budgetary Resources – Semantic Guide

## What this endpoint does

Returns a ten-year snapshot of an agency’s budgetary resources, obligations, outlays, and fiscal-period obligation rollups for a specified toptier (CGAC or FREC) code.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/budgetary_resources/`
- **Auth:** None required (observed in all probes).
- **Parameters:**
  - `toptier_code` (path, string, required) – Numeric CGAC or FREC code (3–4 digits). Unknown numeric codes return a JSON 404; non-numeric or wrong-length segments fall through to an HTML 404. Use the trailing slash to avoid a 301 redirect.

---

## How to interpret the response

- Top-level object with `toptier_code`, `agency_data_by_year`, and `messages`.
- `agency_data_by_year` lists fiscal years in descending order (currently FY 2026–2017). Each entry includes agency-level resources, obligations, outlays (nullable), government-wide `total_budgetary_resources`, and `agency_obligation_by_period`.
- `agency_obligation_by_period` is cumulative by period (1–12), ordered ascending; when data exists, the final period’s `obligated` matches `agency_total_obligated`. The array may be empty when yearly totals are null.
- `messages` is always an array; probes only observed it empty, so treat any future contents as advisory text.

---

## Known doc mismatches

- Documentation labels the array as `agency_by_year`, but production responses use `agency_data_by_year`.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Handle `null` values for agency totals and empty `agency_obligation_by_period` arrays without coercing them to zero.
  - Fetch and process the full multi-year payload, or trim it client-side if you only need recent years.
- **Don’t:**
  - Don’t rely on HTML 404 bodies for error details—only numeric codes return structured JSON.
  - Don’t assume `messages` provides guidance; it has been empty in all observed responses.

---

## Runnable examples

```http
GET /api/v2/agency/247/budgetary_resources/ HTTP/1.1
Host: api.usaspending.gov
```

- Returns FY 2026 with null agency totals and empty period data, plus prior years (e.g., FY 2021) where period 12 equals the annual obligation total.
- `messages` is an empty array, matching all observed probes.
