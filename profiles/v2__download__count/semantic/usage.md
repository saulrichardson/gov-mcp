# Download Count

## When to use this endpoint
Use `POST /api/v2/download/count/` as a **preflight size check** before you start a custom USAspending download. It answers questions like:

- How many rows match these advanced filters?
- Will this download exceed the current row-limited cap?
- Should I request transactions, awards, or subawards for the next step?
- Does `time_period.date_type` change the preflight count I care about?

Live availability was confirmed on 2026-05-12 with successful transaction-level, award-level, `date_signed`, and unused-filter-warning probes.

## When not to use it
Do **not** use this endpoint when you need:

- actual award, transaction, or subaward records
- grouped analytics by agency, geography, recipient, or time bucket
- a download job or file URL

This endpoint returns one aggregate count object plus limit flags and messages.

## Request shape
- Method: `POST`
- Path: `/api/v2/download/count/`
- Content type: `application/json`
- Required body field:
  - `filters` — advanced filter object
- Optional top-level body fields:
  - `spending_level` — `awards`, `transactions`, or `subawards`; live default is `transactions`
  - `subawards` — legacy hidden boolean still present in source code; prefer `spending_level: "subawards"`

Important filter branches preserved in the semantic bundle:
- `filters.time_period`
- `filters.time_period.date_type`
- `filters.keywords`
- `filters.place_of_performance_scope`
- `filters.place_of_performance_locations`
- `filters.agencies`
- `filters.recipient_search_text`
- `filters.recipient_id`
- `filters.recipient_scope`
- `filters.recipient_locations`
- `filters.recipient_type_names`
- `filters.award_type_codes`
- `filters.award_ids`
- `filters.award_amounts`
- `filters.program_numbers`
- `filters.naics_codes`
- `filters.psc_codes`
- `filters.contract_pricing_type_codes`
- `filters.set_aside_type_codes`
- `filters.extent_competed_type_codes`
- `filters.tas_codes`
- `filters.treasury_account_components`

## Request templates

### Transaction-level preflight
```json
{
  "filters": {
    "time_period": [
      {
        "start_date": "2022-10-01",
        "end_date": "2023-09-30"
      }
    ]
  }
}
```
Observed 2026-05-12 result: `calculated_count = 12868988`, `spending_level = "transactions"`, `rows_gt_limit = true`.

### Award-level preflight for the same slice
```json
{
  "filters": {
    "time_period": [
      {
        "start_date": "2022-10-01",
        "end_date": "2023-09-30"
      }
    ]
  },
  "spending_level": "awards"
}
```
Observed 2026-05-12 result: `calculated_count = 11507418`, `spending_level = "awards"`, `rows_gt_limit = true`.

### Use `date_signed` inside `time_period`
```json
{
  "filters": {
    "time_period": [
      {
        "date_type": "date_signed",
        "start_date": "2020-01-01",
        "end_date": "2020-01-03"
      }
    ]
  }
}
```
Observed 2026-05-12 result: `calculated_count = 259770`, `rows_gt_limit = false`.

## How to interpret the response
Prefer these fields for business logic:
- `calculated_count` — the main count for the resolved `spending_level`
- `spending_level` — confirms whether the count is for transactions, awards, or subawards
- `maximum_limit` and `rows_gt_limit` — tell you whether a row-limited custom download is feasible
- `messages` — warnings about date limits, ignored filters, and deprecations

### Important caveat about `transaction_*` fields
The live API currently returns `calculated_transaction_count`, `maximum_transaction_limit`, and `transaction_rows_gt_limit` as **legacy aliases** of the primary count fields, not as a second independent transaction-only measure.

Evidence from 2026-05-12:
- same filter, default transactions: `calculated_transaction_count = 12868988`
- same filter, `spending_level = "awards"`: `calculated_transaction_count = 11507418`

Because the second value is the award-level count, use `calculated_count` + `spending_level` as the authoritative interpretation.

## Message handling
Successful responses always returned `messages` in live probes. Expect at least:
- the time-period warning about the 2007-10-01 search floor
- the subawards deprecation warning
- the transaction_* deprecation warning

If you send an unknown nested filter key, the API can still return 200 and add an unused-filter warning instead of rejecting the request.

## Recommended workflow
1. Build the exact filters you plan to use downstream.
2. Call `v2__download__count` first.
3. Check `calculated_count`, `maximum_limit`, and `rows_gt_limit`.
4. If `rows_gt_limit` is `false`, reuse the filters in the relevant download endpoint.
5. If `rows_gt_limit` is `true`, narrow filters or move to a bulk/larger-volume workflow.

## Caveats
- Search-style time periods are limited to an earliest date of `2007-10-01`; the API itself repeats this warning in live responses.
- Many less-common filter branches are preserved from docs/source but were not re-probed live in this bundle.
- Current raw-profile evidence indicates malformed request bodies can still produce a generic HTML 500, so client-side validation is safer than assuming all errors will be structured JSON.
