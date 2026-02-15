# Custom Account Download – Semantic Guide

## What this endpoint does
Generates a custom download package of account-level financial data based on fiscal filters and returns metadata needed to monitor and fetch the generated archive. Jobs run asynchronously; the response supplies URLs to poll status and retrieve the finished zip.

---

## How to call it
- **Method & path:** `POST /api/v2/download/accounts/`
- **Auth:** Not required in observed probes.
- **Body fields:**
  - `account_level` (body, string, required) – Use `federal_account` or `treasury_account`; other values trigger a WAF 500 block.
  - `file_format` (body, string, optional) – Accepts `csv`, `tsv`, or `pstxt`; defaults to `csv` and rejects other values with 400.
  - `filters.fy` (body, string, required) – Fiscal year (`YYYY`); server echoes it as an integer.
  - `filters.quarter` (body, string, optional) – One of `"1"`–`"4"`; mutually exclusive with `filters.period`.
  - `filters.period` (body, string, optional) – One of `"2"`–`"12"`; mutually exclusive with `filters.quarter`. Send as a string—numeric JSON values drop the connection.
  - `filters.submission_types` (body, array[string], optional but preferred) – Provide at least one of `account_balances`, `object_class_program_activity`, or `award_financial`; empty arrays return 422.
  - `filters.submission_type` (body, string, optional) – Legacy alias normalized to `submission_types`; repeated use can trip WAF protections.
  - `filters.def_codes` (body, array[string], optional) – Each entry must match the documented DEFC list; invalid codes return 400 with the allowed set.
  - `filters.agency` (body, string, optional) – Accepts toptier agency codes such as `"097"`; malformed values may still trigger WAF blocks.
  - `columns` (body, array[string], optional) – Echoed verbatim when non-empty; empty arrays may be dropped.

Always include exactly one of `filters.quarter` or `filters.period`, and ensure at least one dataset is provided via `submission_types` or the singular alias.

---

## How to interpret the response
- Root object containing `status_url`, `file_name`, `file_url`, and `download_request`.
- `download_request` echoes normalized settings: strings may return as integers, unspecified filters appear as `'all'`, and `download_types` mirrors the chosen datasets.
- `columns` only appears when a non-empty list was sent.
- Use `status_url` to poll job completion before downloading `file_url`.

---

## Known doc mismatches
- Docs list `file_url` as `/csv_downloads/...`, but live responses return absolute HTTPS URLs.

---

## Pitfalls & safe-usage checklist
- **Do:** Validate quarter/period inputs locally and send them as strings; prefer `submission_types` over the legacy singular field; poll `status_url` until the job is ready before fetching large archives.
- **Don’t:** Send both quarter and period in the same request; rely on the API to catch typos in `columns`; ignore WAF 500 responses—treat them as hard failures and retry with adjusted inputs.

---

## Runnable examples
```http
POST /api/v2/download/accounts/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "account_level": "federal_account",
  "filters": {
    "fy": "2023",
    "quarter": "1",
    "submission_types": [
      "account_balances"
    ],
    "agency": "097"
  }
}
```

- Returns 200 with absolute `status_url`, `file_name`, and `file_url` pointing to the generated archive.
- `download_request.filters` echoes defaults such as `budget_function: "all"` and coerces `fy`, `quarter`, and inferred `period` to integers.
