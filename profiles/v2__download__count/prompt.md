# Download Count – Semantic Guide

## What this endpoint does
Counts awards, transactions, or subawards that match the provided advanced search filters and flags when download row limits will be exceeded. Responses always echo the effective spending level and return warning messages about current platform limits.

---

## How to call it
- **Method & path:** `POST /api/v2/download/count/`
- **Auth:** Not required in observed probes.
- **Body parameters:**
  - `filters` (body, object, required) – container for advanced search filters. Must be a JSON object; missing, null, or non-object values trigger a 500 HTML error. An empty object counts the full dataset.
  - `filters.time_period` (body, array, optional) – date ranges with `start_date`/`end_date` (YYYY-MM-DD). Dates before `2007-10-01` return 422; malformed dates return 400.
  - `filters.keywords` (body, array[string], optional) – keyword list; sending a string returns 400.
  - `filters.recipient_search_text` (body, array[string], optional) – must include at least one value; empty array returns 422. Multiple entries are accepted.
  - Other documented filters such as `recipient_locations`, `recipient_type_names`, `psc_codes`, `award_amounts`, `naics_codes`, `tas_codes`, `treasury_account_components`, `award_type_codes`, `contract_pricing_type_codes`, `set_aside_type_codes`, and `extent_competed_type_codes` were observed accepting arrays/objects of strings as shown in probes.
  - `spending_level` (body, string, optional) – one of `awards`, `transactions`, `subawards`. Defaults to `transactions`; invalid values return 400.

---

## How to interpret the response
- Top-level object with numeric counts and boolean limit flags.
- `calculated_transaction_count` always appears and reflects underlying transactions, even when requesting awards or subawards.
- `calculated_count` mirrors the requested `spending_level`; compare against `maximum_limit` to decide whether the requested download will exceed row limits (`rows_gt_limit`).
- `maximum_transaction_limit`/`maximum_limit` were consistently `500000`; treat them as the current cap but monitor for change.
- `messages` always contained three warning strings about time period limits, subaward deprecation, and upcoming renames of fields using the `transaction_*` prefix.

---

## Known doc mismatches
- Server accepts multiple `recipient_search_text` entries and rejects empty arrays, contradicting the documented maximum of one item.
- `messages` field is always present despite being documented as optional.
- Missing or non-object `filters` payloads yield generic 500 HTML pages instead of structured validation errors.

---

## Pitfalls & safe-usage checklist
- **Do:** Validate request bodies locally; ensure `filters` is a populated object and required arrays (e.g., `recipient_search_text`) meet minimum sizes.
- **Do:** Inspect `rows_gt_limit` and `transaction_rows_gt_limit`; when true, switch to bulk endpoints or tighten filters before attempting a download.
- **Do:** Watch `messages` for notice of future schema changes, especially deprecation of `transaction_*` fields.
- **Don’t:** Assume IPv6 connectivity will succeed; observed probes required IPv4 fallback.
- **Don’t:** Rely on award amount boundary inclusivity; behavior is still unverified.

---

## Runnable example
```http
POST /api/v2/download/count/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filters": {
    "time_period": [
      {
        "start_date": "2023-10-01",
        "end_date": "2023-12-31"
      }
    ]
  }
}
```

Returns:
- `calculated_transaction_count`: `3331810`
- `rows_gt_limit`: `true`
- `messages`: includes time-period, subaward, and transaction_* rename warnings.
