# v2/agency/{toptier_code}/awards/new/count – Semantic Guide

## What this endpoint does

Returns the count of new awards associated with a given toptier agency. Defaults reflect the current fiscal year and awarding role, with optional filters for fiscal year, agency role, and validated award type code lists (including API-exposed sentinel tokens).

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/awards/new/count/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `toptier_code` (path, string, required) – 3–4 digit numeric agency identifier; non-numeric or wrong-length codes return 404 HTML.
  - `fiscal_year` (query, string, optional) – 4-digit year; accepts 2008–2026. Non-digits yield 400; values outside range yield 422. Defaults to current FY when omitted.
  - `agency_type` (query, string, optional) – `awarding` (default) or `funding`; parameter is case-sensitive (`FUNDING` is rejected).
  - `award_type_codes` (query, string, optional) – Comma-separated uppercase tokens from `['-1','02','03','04','05','06','07','08','09','10','11','A','B','C','D','IDV_A','IDV_B','IDV_B_A','IDV_B_B','IDV_B_C','IDV_C','IDV_D','IDV_E','no intersection']`; embedded spaces or lowercase cause 400 responses. Sentinels `-1` and `no intersection` can be mixed with standard codes.

---

## How to interpret the response

- Returns a JSON object with `toptier_code`, `fiscal_year`, `agency_type`, `award_type_codes`, and `new_award_count`.
- `award_type_codes` is `null` when no filter is provided; otherwise it echoes the validated tokens in the order supplied.
- `new_award_count` is an integer representing the number of new awards meeting the request filters.

---

## Known doc mismatches

- Docs promise `award_type_codes` is always an array, but the API returns `null` when the filter is omitted.
- Documentation sample uses `award_count`, while the live API returns `new_award_count`.
- Docs omit sentinel award type codes `-1` and `no intersection`, yet the API validates against them.

---

## Pitfalls & safe-usage checklist

- **Do:** Include the trailing slash on the endpoint path to avoid 301 redirects.
- **Do:** Validate or normalize award type tokens to uppercase with no spaces before calling.
- **Don’t:** Assume 404 errors will be JSON; invalid agency codes return HTML pages.
- **Don’t:** Cache the default fiscal year value; it advances with the current reporting year.

---

## Runnable examples

```http
GET /api/v2/agency/086/awards/new/count/?award_type_codes=A,-1 HTTP/1.1
Host: api.usaspending.gov
```

```json
{
  "toptier_code": "086",
  "fiscal_year": 2026,
  "agency_type": "awarding",
  "award_type_codes": ["A", "-1"],
  "new_award_count": 3
}
```
