# Spending by Award Count

## When to use this endpoint

Use `POST /api/v2/search/spending_by_award_count/` when you already know the advanced-search filters you want and need a compact count of how many matching results fall into the major award-type buckets.

This endpoint works well as a **preflight classification endpoint**:
- check whether a filtered population is mostly contracts, grants, loans, direct payments, other, or IDVs
- compare award-level versus subaward-level grouping
- follow a state-level `v2__disaster__spending_by_geography` result into an award-type mix drilldown
- decide whether a downstream record-detail or spending-total query is worth running

## When not to use it

Do **not** use this endpoint for:
- dollar totals, obligations, or outlays
- paginated award listings
- detailed records for individual awards or subawards
- distributions by every raw `award_type_code`

The response is a single aggregate object, not a row list.

## Request shape

Content type: `application/json`

Top-level body fields:
- `filters` **required**: advanced search filter object
- `spending_level` optional: `awards` or `subawards`; documented default is `awards`
- `subawards` optional boolean; documented default is `false` unless `spending_level` is `subawards`

Important documented filter families include:
- `time_period`
- `agencies`
- `recipient_search_text`, `recipient_scope`, `recipient_locations`, `recipient_type_names`
- `place_of_performance_scope`, `place_of_performance_locations`
- `award_type_codes`, `award_ids`, `award_amounts`
- `program_numbers`, `program_activity`, `program_activities`
- `naics_codes`, `tas_codes`, `psc_codes`
- `contract_pricing_type_codes`, `set_aside_type_codes`, `extent_competed_type_codes`
- `treasury_account_components`
- `object_class`
- `def_codes`

## Request templates

### Prime-award counts

```json
{
  "filters": {
    "time_period": [
      {
        "start_date": "2025-10-01",
        "end_date": "2026-09-30"
      }
    ]
  }
}
```

### Subaward counts

```json
{
  "spending_level": "subawards",
  "subawards": true,
  "filters": {
    "time_period": [
      {
        "start_date": "2025-10-01",
        "end_date": "2026-09-30"
      }
    ]
  }
}
```

### Disaster-geography follow-up: recipient-location state drilldown

Use this after `v2__disaster__spending_by_geography` returns a **state-level** row and the upstream query used `scope: "recipient_location"` or omitted `scope` and accepted the default recipient geography.

Keep the same DEFC filter and translate each non-null `shape_code` into a downstream recipient location object. Do **not** translate the uncoded row where `shape_code` is `null`.

```json
{
  "filters": {
    "def_codes": ["L"],
    "recipient_scope": "domestic",
    "recipient_locations": [
      {
        "country": "USA",
        "state": "VA"
      }
    ]
  }
}
```

Reviewer-backed evidence showed this Virginia drilldown returning HTTP 200 with `contracts: 365`, `grants: 47`, and zeros for the other award-type buckets.

### Disaster-geography follow-up: place-of-performance state drilldown

Use this after `v2__disaster__spending_by_geography` returns a **state-level** row from a query that used `scope: "place_of_performance"`.

Keep the same DEFC filter and map each non-null state `shape_code` into `place_of_performance_locations`. Replace the sample state below with a state code from the geography response.

```json
{
  "filters": {
    "def_codes": ["L"],
    "place_of_performance_scope": "domestic",
    "place_of_performance_locations": [
      {
        "country": "USA",
        "state": "CA"
      }
    ]
  }
}
```

This second pattern is backed by the promoted disaster-geography workflow and usage guidance for state-code mapping, even though this bundle's sampled downstream success case used the recipient-location variant.

## Response interpretation

Response fields:
- `results`: count container
- `spending_level`: echoed or defaulted request mode
- `messages`: optional warnings or instructional messages

For award-level responses, `results` contains numeric counts for:
- `grants`
- `loans`
- `contracts`
- `direct_payments`
- `other`
- `idvs`

For subaward-level responses, live probing also confirmed:
- `subgrants`
- `subcontracts`

## Cross-endpoint workflow

A reliable bounded workflow is:
1. call `v2__disaster__spending_by_geography` with a DEFC filter and `geo_layer: "state"`
2. choose a non-null state `shape_code` from the returned geography rows
3. keep the same DEFC in this endpoint
4. map that state into the location family that matches the upstream geography scope:
   - recipient geography -> `recipient_scope` + `recipient_locations`
   - place of performance geography -> `place_of_performance_scope` + `place_of_performance_locations`
5. use this endpoint to measure the award-type mix for that bounded state slice

This gives you award-type composition for the geography slice without treating the geography rollup itself as record-level evidence.

## Caveats

- `time_period` semantics depend on whether you are querying awards or subawards.
- Quoted `award_ids` are documented as exact matches; unquoted values are fuzzier full-text matches.
- `def_codes` have documented special behavior that changes between prime-award and subaward mode, especially for COVID-19 and IIJA-related filters.
- Search responses can include a warning that date coverage is currently limited to an earliest date of `2007-10-01`; use download-style endpoints for older history.
- No pagination is documented for this endpoint.
