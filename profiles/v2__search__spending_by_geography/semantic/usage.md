# Spending by Geography

## When to use this endpoint

Use `v2__search__spending_by_geography` when you need advanced-search spending filters summarized into geography buckets instead of award-level detail. It is best for map-style analysis and comparisons across:

- states
- counties
- congressional districts
- countries

You can summarize by either:

- `scope = place_of_performance`
- `scope = recipient_location`

And you can choose the aggregation source with `spending_level`:

- `transactions` (documented default)
- `awards`
- `subawards`

## When not to use it

Do **not** use this endpoint when you need:

- award-level or transaction-level rows
- documented pagination or sort controls for scrolling large detail sets
- search coverage earlier than `2007-10-01`

This endpoint returns grouped geography totals, not detailed records.

## Core request shape

Send a `POST` request to `/api/v2/search/spending_by_geography/` with JSON body fields:

- `filters` — required `AdvancedFilterObject`
- `scope` — required; `place_of_performance` or `recipient_location`
- `geo_layer` — required; `state`, `county`, `district`, or `country`
- `spending_level` — optional; defaults to `transactions`
- `geo_layer_filters` — optional list of geography codes to limit the returned rows
- `subawards` — optional legacy boolean; prefer `spending_level = subawards`

## Request templates

### Minimal state aggregation

```json
{
  "filters": {
    "keywords": ["infrastructure"]
  },
  "scope": "place_of_performance",
  "geo_layer": "state"
}
```

### County aggregation by recipient location

```json
{
  "filters": {
    "recipient_scope": "domestic",
    "recipient_search_text": ["school district"]
  },
  "scope": "recipient_location",
  "geo_layer": "county",
  "spending_level": "awards"
}
```

## Important filter families

The endpoint reuses the broader advanced-search filter object. Common documented filter families include:

- `time_period`
- `agencies`
- `place_of_performance_locations`
- `recipient_locations`
- `recipient_search_text`
- `recipient_type_names`
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
- `object_class`
- `program_activity`
- `program_activities`
- `def_codes`

Two scope-related filters have documented defaults of `domestic` only for `geo_layer` values `county`, `district`, and `state`:

- `filters.place_of_performance_scope`
- `filters.recipient_scope`

## How to read the response

The response echoes:

- `scope`
- `geo_layer`
- `spending_level`

The main payload is `results`, where each row represents one geography bucket with fields such as:

- `shape_code` — geography identifier
- `display_name` — geography label
- `aggregated_amount` — aggregated obligation amount
- `population` — nullable
- `per_capita` — nullable
- `total_outlays` — only documented for `spending_level = awards`

A `messages` array may also appear with warnings or guidance.

## Interpretation tips

- Treat each row as one geography unit at the selected `geo_layer`.
- Use `shape_code` together with `geo_layer` when joining to reference geography tables or map shapes.
- Handle `population` and `per_capita` as nullable.
- Do not assume `total_outlays` exists unless you requested award-level spending.

## Caveats

- The documented sample warns that `subawards` will be deprecated; use `spending_level = subawards` for new work.
- The documented sample also warns that search time periods are currently limited to an earliest date of `2007-10-01`.
- Some nested filter object details are defined in shared `search_filters` documentation rather than on this page.
- The docs do not describe pagination fields for this endpoint.
