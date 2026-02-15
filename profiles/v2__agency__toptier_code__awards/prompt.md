# Agency Awards – Semantic Guide

## What this endpoint does

Returns aggregated transaction counts and obligations for a single toptier agency and fiscal year. Supports switching between awarding and funding perspectives and narrowing the totals by award type codes.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/awards/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `toptier_code` (path, string, required) – Numeric CGAC or FREC code. Observed 3-digit (`020`) and 4-digit (`9553`) codes succeed; unknown values return 404.
  - `fiscal_year` (query, integer, optional) – 2008–2026 inclusive. Omit to use the API’s current FY (2026). Non-integers trigger 400; outside the range triggers 422.
  - `agency_type` (query, string, optional) – Case-sensitive enum `awarding` or `funding`. Empty string behaves like omission and defaults to `awarding`; any other value returns 400.
  - `award_type_codes` (query, string, optional) – Single comma-delimited token of accepted codes (`-1`, `no intersection`, `02`–`11`, `A`–`D`, `IDV_*`). No spaces; repeat parameters keep only the last value. Sentinels only yield zero totals when used alone.

---

## How to interpret the response

- Response is a JSON object.
- `toptier_code`, `fiscal_year`, `transaction_count`, and `obligations` echo the aggregation context and totals.
- `latest_action_date` is an ISO timestamp when transactions exist, or `null` when the filter set finds none.
- `messages` is an array of warning strings. Fiscal years 2008–2016 include a DATA Act availability notice; 2017+ responses omit it.

---

## Known doc mismatches

- API Blueprint treats `award_type_codes` as an array, but production expects a single comma-delimited string and ignores all but the last repeated parameter.
- Docs omit the `-1` and `no intersection` sentinel codes that production accepts.
- Docs do not mention the enforced fiscal year range of 2008–2026 (422 otherwise).

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate `award_type_codes` format (uppercase, comma-separated, no spaces) before sending.
  - Watch for `messages` when querying pre-2017 fiscal years to surface DATA Act warnings downstream.
  - Treat `latest_action_date` as nullable when filters isolate zero transactions.
- **Don’t:**
  - Don’t rely on IPv6-only connectivity without retries; probes saw empty replies.
  - Don’t send arrays or spaced tokens for `award_type_codes`; production rejects them with 400.

---

## Runnable examples

```http
GET /api/v2/agency/020/awards/?agency_type=funding&fiscal_year=2023 HTTP/1.1
Host: api.usaspending.gov
```

- Returns funding-side totals for FY2023: `transaction_count` 23461, `obligations` 23404493696.83, empty `messages`.

```http
GET /api/v2/agency/020/awards/?award_type_codes=03 HTTP/1.1
Host: api.usaspending.gov
```

- Returns contract award totals filtered to code `03`; `latest_action_date` may be `null` if no transactions match, so guard for that case.
