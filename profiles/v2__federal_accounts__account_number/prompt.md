# Federal Account (by `account_number`) – Semantic Guide

## What this endpoint does

Returns summary metadata and child Treasury Account totals for a single federal account identified by `account_number`. You can optionally scope the totals and `children` list to an appropriations `fiscal_year`; when the year has no child Treasury Accounts, `children` is empty and the totals are `null`.

---

## How to call it

- **Method & path:** `GET /api/v2/federal_accounts/{account_number}/`
- **Host:** `https://api.usaspending.gov`
- **Auth:** None required (observed probes).
- **Parameters:**
  - `account_number` (path, string, required) – Federal account symbol.
    - Observed route-compatible format: `###-####` (e.g., `011-1022`).
    - Non-matching formats return `404 Not Found` with an HTML body.
    - Matching format but unknown account returns `400` JSON with `{"detail": ...}`.
  - `fiscal_year` (query, integer-like, optional) – Fiscal year used for totals/children.
    - If omitted, the API defaults to its current FY (observed default was `2026` at probe time) and `response.fiscal_year` is a number.
    - If provided, the API echoes the raw query value in `response.fiscal_year` (e.g., `fiscal_year=02022` → `"fiscal_year": "02022"`).
    - Non-integer values (e.g., `2022.0`, `abcd`, empty string) can trigger `500 Server Error` with an HTML body.
    - Duplicate `fiscal_year` parameters are accepted but yield a single-year response with unclear selection; avoid duplicates.

---

## How to interpret the response

- **Top-level shape:** JSON object.
- **Key fields:**
  - `id` – Internal federal account id.
  - `federal_account_code`, `agency_identifier`, `main_account_code` – Identifiers for the account.
  - `account_title`, `parent_agency_*`, `bureau_*` – Display metadata.
  - `children` – Array of Treasury Accounts. Each child includes `name`, `code`, and three amount fields.
  - `total_obligated_amount`, `total_gross_outlay_amount`, `total_budgetary_resources` – Totals across `children`.
- **Null/empty behavior:** When there are no child Treasury Accounts for the selected year, `children` is `[]` and the `total_*` fields are `null`.

---

## Known doc mismatches

- Docs describe a “landing page listing all federal accounts”, but this endpoint returns a single federal account object for a provided `account_number`.
- Docs describe `fiscal_year` as numeric, but the API returns `fiscal_year` as a number when defaulted and as a string echo of the query parameter when a `fiscal_year` query param is provided.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Provide a canonical `fiscal_year` like `2022` for repeatability and clearer downstream parsing.
  - Validate `fiscal_year` client-side as an integer-like value to avoid `500` HTML errors.
  - Handle mixed error content-types (JSON for `400`/`405`, HTML for `404`/`500`).
- **Don’t:**
  - Don’t treat `response.fiscal_year` as normalized; parse/normalize it yourself if you need an integer.
  - Don’t send `fiscal_year` multiple times; selection is unclear.

---

## Runnable examples

```http
GET /api/v2/federal_accounts/011-1022/?fiscal_year=2022 HTTP/1.1
Host: api.usaspending.gov
```

```http
GET /api/v2/federal_accounts/011-1022/ HTTP/1.1
Host: api.usaspending.gov
```

```http
GET /api/v2/federal_accounts/000-0000/ HTTP/1.1
Host: api.usaspending.gov
```
