# Award Spending Recipient – Semantic Guide

## What this endpoint does

Aggregates prime award obligations by recipient for a specified fiscal year and awarding toptier agency. Returns recipients ordered by total obligated_amount so you can page through the highest-to-lowest obligation totals.

---

## How to call it

- **Method & path:** `GET /api/v2/award_spending/recipient/`
- **Auth:** None required in observed probes.
- **Parameters:**
  - `awarding_agency_id` (query, integer, required) – Must match a valid awarding toptier agency; other integers return 400 and non-integer values yield an HTML 500 error page.
  - `fiscal_year` (query, integer, required) – Fiscal year to aggregate; any integer is accepted but unsupported years simply return empty results. Non-integer input yields an HTML 500 error page.
  - `limit` (query, integer, optional) – Defaults to 100. Values ≤0 are normalized to 1, values above 500 are capped to 500, and non-integer input triggers an HTML 500 response.
  - `page` (query, integer, optional) – Defaults to 1. Values ≤0 are normalized to 1; pages past the dataset return empty `results` with 200 status. Non-integer input triggers an HTML 500 response.

---

## How to interpret the response

- Top-level object containing `page_metadata` and `results`.
- `page_metadata` echoes normalized `limit`/`page`, provides record `count`, booleans for `has_next_page`/`has_previous_page`, and fully-qualified `next`/`current`/`previous` URLs (null when not applicable).
- `results` is an array sorted by `obligated_amount` descending. Each item exposes `award_category`, `obligated_amount` as a decimal string (can be zero or negative), and `recipient.recipient_name`, which may be a real name, the literal `REDACTED DUE TO PII`, or null.

---

## Known doc mismatches

- Docs describe `awarding_agency_id` as a recipient identifier, but production requires a valid awarding toptier agency ID.
- Docs imply `award_category` will be `contracts`, yet production uses lower-case labels such as `contract`, `idv`, `grant`, `direct payment`, and `loans`.
- Docs omit the default, floor, and cap logic around `limit` (defaults to 100, normalized to ≥1, capped at 500).
- Current raw-MCP analyst testing did not validate a stable upstream source for `awarding_agency_id`; the Department of Defense autocomplete id `1173` returned an empty FY2025 response, and award search did not consistently expose a helper column for the join.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate and coerce numeric query parameters client-side to avoid HTML 500 error pages.
  - Set an explicit `limit` tuned to your bandwidth needs; large agencies can exceed thousands of recipients at the default 100-per-page.
  - Watch `page_metadata.has_next_page` to drive pagination rather than assuming a fixed number of pages.
  - Verify the agency identifier source locally before depending on this endpoint in a multi-step analysis.
- **Don’t:**
  - Don’t assume `recipient_name` is always present or human-readable—handle `null` and `REDACTED DUE TO PII`.
  - Don’t treat empty result sets as errors; they may indicate unsupported fiscal years or pages past the dataset.
  - Don’t assume `autocomplete/awarding_agency` ids are valid `awarding_agency_id` inputs for this endpoint unless you have re-probed that join.

---

## Runnable examples

```http
GET /api/v2/award_spending/recipient/?awarding_agency_id=7&fiscal_year=2023&limit=3 HTTP/1.1
Host: api.usaspending.gov
```

- Returns page 1 with `count: 32`, `has_next_page: true`, and top recipients such as `APPRISS LLC` with `obligated_amount: "3000.00"`.
- Pagination URLs in `page_metadata` reflect the normalized query (`limit=3`, `page=1`).
