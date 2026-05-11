# Spending by Award

## When to use this endpoint

Use `v2__search__spending_by_award` when you need the actual award or subaward rows behind USAspending advanced-search filters.

This is the row-level search surface for questions like:

- which awards match these filters?
- which recipients or agencies appear in this slice?
- which subawards belong to the filtered population?
- which rows should I inspect further with award-detail workflows?

Live probing confirmed award-mode availability.

## When not to use it

Do **not** use this endpoint when you need:

- pre-aggregated totals by geography, time, or award type
- a bulk-export workflow for very large populations
- fields you did not explicitly include in `fields`

This endpoint returns projected rows, not ready-made aggregates.

## Core request shape

Send `POST /api/v2/search/spending_by_award/` with JSON body keys:

- `filters` — required `AdvancedFilterObject`
- `fields` — required array of API-defined field labels
- `limit` — optional; documented default `10`
- `page` — optional page number
- `sort` — optional sort field label; defaults to the first requested field
- `order` — optional `asc` or `desc`; documented default `desc`
- `subawards` — optional legacy boolean for subaward mode
- `spending_level` — optional `awards` or `subawards`; live probing confirmed the default is `awards`
- `last_record_unique_id` and `last_record_sort_value` — optional paired cursor values for sequential Elasticsearch pagination

## Important filter families

The endpoint reuses the broader advanced-search filter object. Important documented filter families include:

- `time_period`
- `agencies`
- `recipient_search_text`
- `recipient_locations`
- `place_of_performance_locations`
- `award_type_codes`
- `award_ids`
- `award_amounts`
- `program_numbers`
- `naics_codes`
- `tas_codes`
- `psc_codes`
- `contract_pricing_type_codes`
- `set_aside_type_codes`
- `extent_competed_type_codes`
- `treasury_account_components`
- `program_activity`
- `program_activities`
- `def_codes`
- `award_unique_id`

Two shared nested shapes matter especially:

- `time_period` changes shape between award-mode and subaward-mode requests.
- location filters use the shared `search_filters` location-object definitions rather than a fully inlined schema on this page.

## Request templates

### High-value contract screening

Use this when you want the first page to surface top-dollar contract awards immediately instead of alphabetical award IDs.

This is the machine-readable template for `high_value_award_screening`.

```json
{
  "filters": {
    "award_type_codes": ["A", "B", "C", "D"],
    "time_period": [
      {
        "start_date": "2025-10-01",
        "end_date": "2026-09-30"
      }
    ]
  },
  "fields": ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency"],
  "page": 1,
  "limit": 5,
  "sort": "Award Amount",
  "order": "desc"
}
```

Reviewer-backed live workflow evidence showed this bounded request pattern validating cleanly and still returning `generated_internal_id` on each row even though the template only asks for four visible display fields. In this bundle, the intended downstream handoff field is the explicit response-side semantic fact `canonical_award_lookup_id`, derived from that helper value.

Interpret the bounded `time_period` here as an activity screen, not as a guarantee that the returned rows were newly signed during that window. Reviewer-backed drilldown evidence showed the FY2026 screen returning `DENA0003525` at `42111665692.01`, while downstream award detail dated that same contract to `2016-12-16` with period of performance through `2027-04-30`. In other words, `Award Amount` remains the award-level amount on the returned row, not a period-only subtotal. Before calling a hit a “new award in this period,” verify `date_signed` or period-of-performance dates in award detail.

### Prime-award preview

Use this for a general bounded award browse. If you specifically want top-dollar contracts first, use **High-value contract screening** above.


```json
{
  "filters": {
    "award_type_codes": ["A", "B", "C", "D"],
    "time_period": [
      {
        "start_date": "2025-10-01",
        "end_date": "2026-09-30"
      }
    ]
  },
  "fields": ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency"],
  "page": 1,
  "limit": 10,
  "sort": "Award ID",
  "order": "asc"
}
```

### Subaward preview

```json
{
  "spending_level": "subawards",
  "subawards": true,
  "filters": {
    "award_type_codes": ["A", "B", "C", "D"],
    "time_period": [
      {
        "start_date": "2025-10-01",
        "end_date": "2026-09-30"
      }
    ]
  },
  "fields": ["Sub-Award ID", "Prime Award ID", "Sub-Award Amount", "Sub-Awardee Name"],
  "page": 1,
  "limit": 10,
  "sort": "Sub-Award ID",
  "order": "asc"
}
```

## Canonical award handoff id

For cross-endpoint award drilldowns, use the semantic alias `canonical_award_lookup_id`.

Map that alias like this:

- prime-award search row: explicit semantic fact `canonical_award_lookup_id` = returned `generated_internal_id`
- subaward row when you want the linked prime award: `prime_award_generated_internal_id`
- `v2__awards__award_id` request: send the same value as path `award_id`
- `v2__awards__award_id` response: expect the same business key to appear as `generated_unique_award_id`
- `v2__awards__funding` request: send the same value as body `award_id`

Do **not** substitute the display `Award ID` or `Prime Award ID` when the generated helper is available. Those display fields are useful for humans, but `canonical_award_lookup_id` is the safer machine handoff key.

Example mapping from reviewer-backed drilldown evidence:

- display `Award ID`: `HT940216C0001`
- `canonical_award_lookup_id`: `CONT_AWD_HT940216C0001_9700_-NONE-_-NONE-`

## How to read the response

The top-level response contains:

- `spending_level`
- `limit`
- `results`
- `page_metadata`
- optional `messages`

`results` is a row array, but the row schema is projection-driven:

- you get the field-label columns you requested in `fields`
- rows also include helper identifiers such as `internal_id`
- live award-mode probing also returned `generated_internal_id`, `awarding_agency_id`, and `agency_slug`; this bundle exposes the response-side semantic fact `canonical_award_lookup_id`, derived from `generated_internal_id`, as the intended downstream award-drilldown handoff field
- subaward-mode rows are documented to include helpers like `prime_award_internal_id` and `prime_award_generated_internal_id`; when you need the linked prime award, treat `prime_award_generated_internal_id` as the prime-award form of `canonical_award_lookup_id`

`page_metadata` includes at least:

- `page`
- `hasNext`
- optional `last_record_unique_id`
- optional `last_record_sort_value`

## Interpretation tips

- Treat `fields` as part of the contract. Changing `fields` changes the row schema.
- Keep award families consistent with the labels you request. Some labels only make sense for contracts, IDVs, loans, assistance, or subawards.
- Do not assume every requested value is a scalar. Some labels such as `NAICS`, `PSC`, and location fields may be structured objects.
- For downstream award-detail or award-funding workflows, read the documented response-side semantic fact `canonical_award_lookup_id` from the selected row; in prime-award mode it is derived from `generated_internal_id` and should be reused unchanged in related endpoints.
- Treat display `Award ID` as a human-facing label, not as the preferred machine handoff id when `canonical_award_lookup_id` is available.
- In high-value screens that use `time_period`, interpret returned rows as awards active in the filtered period. They can be older long-running awards, and `Award Amount` is still the award-level value on the row, so verify award-detail dates before describing a result as newly signed in that period.

## Pagination guidance

Simple paging uses `page` and `limit`, and live probing confirmed that `page_metadata` can also return an Elasticsearch-style cursor pair:

- inspect `page_metadata.last_record_unique_id`
- inspect `page_metadata.last_record_sort_value`
- replay the same request with both cursor values together for the next sequential page

Do not send only one of the two cursor fields.

## Caveats

- Nested filter details are split across shared `search_filters` docs.
- Field labels, valid sort keys, and award families interact; invalid combinations can fail validation.
- The legacy `subawards` boolean and `spending_level` both affect whether rows are awards or subawards.
- Live responses can warn that search dates are currently limited to an earliest date of `2007-10-01`.
- A bounded `time_period` high-value screen can surface older still-active awards. Treat `Award Amount` as the award-level amount on the returned row and check award-detail dates before calling results new awards for the period.
