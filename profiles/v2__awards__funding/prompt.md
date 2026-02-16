# Award Funding – Semantic Guide

## What this endpoint does
Lists federal account funding records for a specific award, including obligated and outlay amounts by reporting period. Responses are paginated and return agency, account, and program context for each funding slice.

---

## How to call it
- **Method & path:** `POST /api/v2/awards/funding/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `award_id` (body, string or integer, required) – Generated award identifier string or surrogate integer id. Arrays, null, or decimals are rejected with 422. Unknown ids return 200 with empty `results`.
  - `limit` (body, integer or numeric string, optional) – Defaults to 10. Accepts 1–100 inclusive. Numeric strings with whitespace or leading zeros are coerced. Values <1 or >100 return 422; decimal or non-numeric strings and null return 400.
  - `page` (body, integer or numeric string, optional) – Defaults to 1. Must resolve to an integer ≥1. Decimal or non-numeric strings and null return 400; values <1 return 422. Large pages return 200 with empty results.
  - `sort` (body, string, optional) – One of `account_title`, `awarding_agency_name`, `disaster_emergency_fund_code`, `federal_account`, `funding_agency_name`, `gross_outlay_amount`, `object_class`, `program_activity`, `reporting_fiscal_date`, `transaction_obligated_amount`. Invalid or null values return 400. If omitted, the API sorts by `account_title` descending and then by `reporting_fiscal_date` ascending.
  - `order` (body, string, optional) – `asc` or `desc` (case sensitive). Defaults to `desc` even without `sort`. Supplying `order` alone flips the implicit `account_title` ordering. Other values or types return 400.

---

## How to interpret the response
- Top-level object with `results` array and `page_metadata` object.
- Each `results` entry includes federal account details, funding and awarding agency ids/names/slugs, object class, program activity code/name (nullable), `transaction_obligated_amount` and `gross_outlay_amount` (nullable and potentially negative), reporting fiscal year/quarter/month (nullable), and `is_quarterly_submission` boolean. `disaster_emergency_fund_code` returns letter codes (e.g., `Q`, `N`) or null.
- `page_metadata` supplies the current `page`, nullable `next`/`previous`, and booleans `hasNext`/`hasPrevious`. No total count is exposed; continue paging while `hasNext` is true.

---

## Known doc mismatches
- Contract lists `disaster_emergency_fund_code` as boolean, but the API returns string letter codes or null.
- Contract marks `program_activity_code`/`program_activity_name` as always present, yet probes show null values.
- Contract claims the default sort is `reporting_fiscal_date` descending; the API defaults to `account_title` descending with older fiscal periods first per account.

---

## Pitfalls & safe-usage checklist
- **Do:** Always validate `results` length because unknown awards return 200 with an empty array.
- **Do:** Page iteratively using `hasNext`; there is no total count.
- **Do:** Normalize monetary fields that may be null or negative before aggregating.
- **Don’t:** Assume doc-stated defaults; confirm sorting behavior (`account_title` desc by default).
- **Don’t:** Submit decimal values for `limit`, `page`, or `award_id`; they trigger validation errors.
- **Don’t:** Treat `disaster_emergency_fund_code` as boolean—handle string codes safely.

---

## Runnable examples
```http
POST /api/v2/awards/funding/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "award_id": "CONT_AWD_0002_2800_SS001740003_2800",
  "limit": 4
}
```
- Returns page 1 with four funding records sorted by `account_title` desc, along with `page_metadata` indicating no further pages.

```http
POST /api/v2/awards/funding/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "award_id": "CONT_AWD_0002_2800_SS001740003_2800",
  "limit": 5.5
}
```
- Responds `400` with `detail` explaining the limit must be an integer.
