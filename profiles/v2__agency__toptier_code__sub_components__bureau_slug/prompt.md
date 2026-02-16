# List Federal Accounts by Sub-Component – Semantic Guide

## What this endpoint does

Returns aggregated budgetary totals and federal account listings for a specific agency sub-component within a fiscal year. Observed data spans FY 2017 through FY 2026, with responses reflecting the selected awarding or funding view.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/sub_components/{bureau_slug}/`
- **Auth:** Not required in observed calls.
- **Parameters:**
  - `toptier_code` (path, string, required) – numeric CGAC/FREC code; non-numeric or wrong-length values return HTML 404.
  - `bureau_slug` (path, string, required) – lowercase hyphenated slug; unknown or cross-agency slugs return 200 with zero data, casing mistakes return HTML 404.
  - `fiscal_year` (query, integer, optional) – valid for FY 2017–2026; >2026 yields 422, ≤2016 triggers HTML 500, non-integers return 400.
  - `agency_type` (query, string, optional) – `awarding` default, `funding` allowed; blank falls back to awarding; other values return 400.
  - `order` (query, string, optional) – `desc` default; accepts `asc`/`desc` only, case-sensitive, invalid values return 400.
  - `sort` (query, string, optional) – defaults to `total_budgetary_resources`; accepts `name`, `id`, `total_obligations`, `total_outlays`, `total_budgetary_resources`.
  - `page` (query, integer, optional) – ≥1; out-of-range pages return empty `results` with `hasNext=false`; 0 or negatives return 422.
  - `limit` (query, integer, optional) – defaults to 10; must be 1–100; outside range returns 422, non-integers return 400.

---

## How to interpret the response

- Response is an object containing request echoes (`toptier_code`, `bureau_slug`, `fiscal_year`), a `totals` object with `total_budgetary_resources`, `total_obligations`, and `total_outlays`, pagination metadata, and a `results` array of federal accounts.
- Each account entry includes `name`, `id`, and the same monetary fields; zero totals indicate no activity for that account.
- `page_metadata.total` is the total record count, not page count. `messages` is an array of warning strings and has been empty in all observed responses.

---

## Known doc mismatches

- API accepts `total_outlays` as a `sort` option and includes it in responses, despite documentation omitting it.
- Federal account results always include `total_outlays`, although the docs do not list that field.
- Documentation examples use `bureau_of_the_census` (underscores); production requires `bureau-of-the-census`.

---

## Pitfalls & safe-usage checklist

- **Do:** Guard against HTML error bodies (404/500) before JSON parsing.
- **Do:** Validate `fiscal_year` ≥2017 and ≤current FY prior to calling.
- **Do:** Verify slug casing and that the slug belongs to the requested toptier before trusting zero totals.
- **Don’t:** Assume differences between `awarding` and `funding` views; confirm if divergence matters for your use case.
- **Don’t:** Treat `page_metadata.total` as total pages; it is the record count.

---

## Runnable example

```http
GET /api/v2/agency/073/sub_components/small-business-administration/?limit=2 HTTP/1.1
Host: api.usaspending.gov
```

- Returns FY 2026 data by default, ordered by `total_budgetary_resources` descending.
- `page_metadata.next` provides the next page number when additional accounts exist.
- Expect `messages` to be an empty array unless the API surfaces warnings.
