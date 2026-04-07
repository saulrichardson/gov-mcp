# Search Spending By Award – Semantic Guide

## What this endpoint does

Returns paginated award-level search rows for a bounded filter scope. It is the main raw endpoint for pulling candidate awards before choosing a row for deeper inspection.

---

## How to call it

- **Method & path:** `POST /api/v2/search/spending_by_award/`
- **Auth:** Not required in observed probes.
- **Body parameters:**
  - `filters` (object, required) – Search filter object; in observed usage this must include `award_type_codes` and any additional scope controls such as time periods, agencies, recipients, or keywords.
  - `fields` (array[string], required) – Non-empty list of API-defined output labels such as `Award ID`, `Recipient Name`, and `Award Amount`.
  - `page` (integer, optional) – 1-indexed page number.
  - `limit` (integer, optional) – Page size.
  - `sort` (string, optional) – Sort token.
  - `order` (string, optional) – `asc` or `desc`.

---

## How to interpret the response

- Top-level object contains `results`, `page_metadata`, and optional `messages`.
- `results` rows are field-label keyed objects, not a stable snake_case schema.
- The response may also include helper columns such as `generated_internal_id`, `internal_id`, `awarding_agency_id`, `agency_slug`, and other non-requested keys depending on the upstream response shape.
- Only `generated_internal_id` is currently treated as a reliable downstream helper column. Other helper columns, including `awarding_agency_id`, are opportunistic and may be absent for otherwise valid queries.
- `page_metadata` is the authoritative pagination object; use it rather than assuming the current page length equals total matches.

---

## Safe follow-up usage

- For award-detail follow-up with `GET /api/v2/awards/{award_id}/`, use `results[*].generated_internal_id` when it is present.
- Do **not** assume the human-facing `Award ID` field is a valid `award_id` path parameter for the award detail endpoint.
- In live usage, `Award ID` values such as `FA861520F0001` returned `404` from the award detail endpoint, while the companion generated hash such as `CONT_AWD_FA861520F0001_9700_FA861520D6052_9700` returned `200`.

---

## Pitfalls & safe-usage checklist

- **Do:** send constrained filters and explicit pagination for stable workloads.
- **Do:** treat `generated_internal_id` as the safest award-detail join key when present.
- **Do:** treat non-requested helper columns other than `generated_internal_id` as best-effort hints that require local verification before reuse.
- **Do:** inspect `page_metadata` for total/next-page state instead of reading only the current row count.
- **Don’t:** treat field labels as canonical schema names across endpoints.
- **Don’t:** assume `Award ID` alone is the correct follow-up identifier for `/api/v2/awards/{award_id}/`.
