# Federal Accounts Landing Page (v2) – Semantic Guide

## What this endpoint does

Returns a paginated list of federal accounts. Each result includes identifiers (e.g., `account_id`, `account_number`), managing agency metadata, and `budgetary_resources` for the fiscal-year context shown in the top-level `fy` field.

---

## How to call it

- **Method & path:** `POST /api/v2/federal_accounts/`
- **Host:** `https://api.usaspending.gov`
- **Auth:** Unknown (probes did not record auth headers).
- **Body:** JSON object.

**Parameters (JSON body)**

- `filters` (object, optional)
  - `fy` (string, optional) – Sets the `fy` context used for `budgetary_resources`. Invalid values return `400` with an allowed-year list in `detail` (observed year strings `2001`–`2026`).
  - `agency_identifier` (string, optional) – Exact string match. In probes, `"012"` returned results while `"12"` returned `count=0` with `200`.
  - Unknown keys inside `filters` return `400`.
- `sort` (object, optional)
  - `field` (string, optional) – One of `budgetary_resources`, `managing_agency`, `account_name`, `account_number`. Invalid values return `400` with allowed values in `detail`.
  - `direction` (string, optional) – Observed accepted values include `asc` and `desc`.
  - Defaults (observed): omit `sort` → sorts by `budgetary_resources` ascending; omit `direction` → defaults to `asc` (observed for `field=budgetary_resources`); provide `direction` without `field` → defaults `field` to `budgetary_resources`.
  - Unknown keys inside `sort` return `400`.
- `limit` (integer, optional) – Default `10`. `0` returns `422` (below min `1`); `101` returns `422` (above max `100`). Digit-only strings like `"5"` are accepted; non-integer numerics like `2.5` return `400`.
- `page` (integer, optional) – Default `1`. `0` returns `422`. Digit-only strings like `"2"` are accepted; non-integer numerics like `2.5` return `400`. Pages beyond the last return `200` with `results: []`.
- `keyword` (string, optional) – Empty string `""` returns `422`. Whitespace-only strings are accepted but echoed as `keyword=""` and behave like an unfiltered search (count unchanged). Response always includes `keyword` (null when omitted).

**Method surface**

- `GET` returns `405` (this endpoint is POST-only).

---

## How to interpret the response

- **Top-level shape:** JSON object with pagination metadata and a `results` array.
- **Pagination:** `count`, `limit`, `page`, `hasNext`, `next`, `hasPrevious`, `previous`. Overflow pages return `200` with `results: []`.
- **Context:** `fy` is the fiscal-year context for `budgetary_resources`. `keyword` echoes the request (`null` when omitted; can be `""` for whitespace-only input).
- **Results items:** `account_id`, `account_number`, `account_name`, `agency_identifier`, `managing_agency`, `managing_agency_acronym` (nullable), `budgetary_resources` (nullable; can be negative).

---

## Known doc mismatches

- Documentation lists default limit as 50, but live responses default to 10.
- Documentation claims sort.direction defaults to 'desc', but omitting direction defaults to 'asc' (and omitting sort entirely sorts by budgetary_resources asc).
- Documentation omits the keyword field in the 200 response payload, but it is always present (null when keyword is omitted).
- Documentation does not describe an upper bound for limit, but the API enforces limit <= 100 (422 when exceeded).
- Documentation describes filters.fy as a string, but the API enforces an enumerated list of certified fiscal years (400 when outside the allowed set).
- Documentation marks managing_agency_acronym as required string, but live data includes null values.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Set `limit` explicitly (<= 100) and paginate using `hasNext`/`next`.
  - Treat `budgetary_resources` and `managing_agency_acronym` as nullable.
  - Validate `agency_identifier` formatting before sending (exact match; padding matters).
  - Trim/validate `keyword` in UI layers to avoid whitespace-only searches.
  - Handle `400`/`405`/`422` responses; error bodies are JSON with `detail`.
  - Implement retries/backoff for occasional network-level connection closes (status=0 was observed in probes).
- **Don’t:**
  - Don’t assume the documented defaults (e.g., `limit=50` or descending sort).
  - Don’t assume empty pages are errors (overflow pages return `200` with `results: []`).

---

## Runnable examples

```http
POST /api/v2/federal_accounts/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"filters":{"fy":"2023"},"limit":1}
```

```http
POST /api/v2/federal_accounts/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"keyword":"256-1760","limit":1}
```

```http
POST /api/v2/federal_accounts/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"limit":101}
```
