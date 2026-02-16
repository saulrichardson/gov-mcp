# List Object Classes – Semantic Guide

## What this endpoint does

Returns aggregated obligated and gross outlay amounts by major object class for a single agency and fiscal year. Supports substring filtering, sortable fields, and paginated access to the object class list.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/object_class/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `toptier_code` (path, string, required) – zero-padded CGAC/FREC identifier; 3–4 digits only. Malformed values return an HTML 404.
  - `fiscal_year` (query, integer, optional) – 2008–2026 inclusive; defaults to FY2026. Requests before FY2017 return empty data with a warning message.
  - `filter` (query, string, optional) – case-insensitive substring for `results[].name`; empty strings are ignored.
  - `sort` (query, string, optional) – one of `obligated_amount`, `gross_outlay_amount`, `name`; defaults to `obligated_amount`.
  - `order` (query, string, optional) – `asc` or `desc`; defaults to `desc` and is case-sensitive.
  - `limit` (query, integer, optional) – page size 1–100; defaults to 10. Out-of-range values raise 422.
  - `page` (query, integer, optional) – 1-indexed page selector; >=1 only. Non-integer or <1 values are rejected.

---

## How to interpret the response

- Response is a JSON object with `toptier_code`, `fiscal_year`, `page_metadata`, `results`, and `messages`.
- `page_metadata.total` reports the total record count; `next`/`previous` are page numbers or null; `hasNext`/`hasPrevious` flag remaining pages.
- `results` is a flat array of `{name, obligated_amount, gross_outlay_amount}` objects; no `children` or higher-level aggregations are returned.
- `messages` is always present. For pre-FY2017 inputs, it contains a DATA Act coverage warning explaining the empty dataset.

---

## Known doc mismatches

- Documented `totals` object is absent from live responses.
- Documented `results[].children` array never appears; responses are flat.
- Documentation cites `page_metadata.count`, but the service returns `page_metadata.total` instead.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Supply zero-padded numeric `toptier_code` values to avoid HTML 404 responses.
  - Paginate with `limit` ≤ 100 and inspect `hasNext` rather than assuming a single page.
  - Examine `messages` for warnings before treating empty `results` as legitimate zeros.
- **Don’t:**
  - Don’t rely on uppercase `order`/`sort` values; the API rejects them.
  - Don’t assume pre-FY2017 fiscal years contain data—even successful responses can be empty.

---

## Runnable examples

```http
GET /api/v2/agency/086/object_class/?limit=5&page=6 HTTP/1.1
Host: api.usaspending.gov
```

- Returns the final page of FY2026 object classes for agency `086` with one record.
- `page_metadata.next` is `null` and `hasNext` is `false`, confirming the last page.
- `messages` is empty, indicating complete data coverage for the requested year.
