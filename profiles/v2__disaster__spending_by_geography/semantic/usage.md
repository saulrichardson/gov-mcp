# Disaster spending by geography

## When to use this endpoint
Use `POST /api/v2/disaster/spending_by_geography/` when you need **aggregated disaster or emergency spending by geography** rather than award-level detail. Live probes on 2026-05-10 confirmed that the endpoint is available for state-level requests and supports both default recipient geography and explicit place-of-performance geography.

Best-fit use cases:
- map DEFC-driven disaster spending by **state**, **county**, or **district**
- compare **obligations** vs **outlays** across geographies
- switch between **recipient location** and **place of performance** with `scope`
- limit the response to a visible map subset with `geo_layer_filters`
- compare `amount`, `award_count`, and `per_capita` across returned geographies

## When not to use it
Do **not** use this endpoint when you need:
- award IDs, recipient names, or transaction rows
- a time series in the response
- all federal spending regardless of disaster designation

Use this endpoint to find interesting geographies first, then drill into award-level endpoints with the same DEFC and geography constraints.

## Request body
Send a **JSON object** body.

Required fields:
- `filter.def_codes`: array of DEFC codes
- `geo_layer`: `state`, `county`, or `district`
- `spending_type`: `obligation`, `outlay`, or `face_value_of_loan`

Optional fields:
- `geo_layer_filters`: list of shape codes to keep in the response
- `scope`: `recipient_location` or `place_of_performance`
  - live probe: omitting `scope` defaulted to `recipient_location`
- `filter.award_type_codes`
- profile-carried shared filter keys such as `filter.time_period`, `filter.recipient_scope`, and `filter.recipient_locations`

## Live-validated request templates

### Minimal state obligation rollup
```json
{
  "filter": {
    "def_codes": ["L"]
  },
  "geo_layer": "state",
  "spending_type": "obligation"
}
```

Observed behavior:
- returned `200 OK`
- response echoed `scope: "recipient_location"`
- response included named state rows plus an uncoded aggregate row with `shape_code: null`

### Filtered state outlays by place of performance
```json
{
  "filter": {
    "def_codes": ["L"]
  },
  "geo_layer": "state",
  "geo_layer_filters": ["CA", "TX"],
  "scope": "place_of_performance",
  "spending_type": "outlay"
}
```

Observed behavior:
- returned `200 OK`
- response echoed `scope: "place_of_performance"`
- response returned only California and Texas in the sampled probe

## How to interpret the response
The response is one object with:
- `geo_layer`
- `scope`
- `spending_type`
- `results`

Each `results` row is one geography aggregate with:
- `shape_code`
- `display_name`
- `amount`
- `population`
- `per_capita`
- `award_count`

Interpretation notes:
- `amount` changes meaning with `spending_type`.
- `amount` can be negative; the live state probe included a negative obligation total for New Jersey.
- `per_capita` is only meaningful where `population` is populated.
- `shape_code` and `display_name` can be `null` for an uncoded aggregate bucket when geography assignment is missing.
- The endpoint is **not paginated**; expect one full `results` array.

## Concrete drilldown mapping to award search
When `geo_layer` is `state`, you can copy each **non-null** `results.shape_code` directly into a downstream award-search location filter while keeping the same `filter.def_codes`. The state code becomes the `state` value inside a location object such as `{"country":"USA","state":"MD"}`.

Use the downstream location field that matches the geography `scope` you used here:

### If this endpoint used recipient geography
If you omitted `scope` and got the live default `recipient_location`, or if you set `scope: "recipient_location"`, map returned state codes into `recipient_locations` and keep the same DEFC filter. For example, if the geography response highlights Maryland and Delaware:

```json
{
  "filter": {
    "def_codes": ["L"],
    "recipient_scope": "domestic",
    "recipient_locations": [
      {"country": "USA", "state": "MD"},
      {"country": "USA", "state": "DE"}
    ]
  }
}
```

### If this endpoint used place of performance geography
If you set `scope: "place_of_performance"`, map returned state codes into `place_of_performance_locations`. For example, if the geography response highlights California and Texas:

```json
{
  "filter": {
    "def_codes": ["L"],
    "place_of_performance_scope": "domestic",
    "place_of_performance_locations": [
      {"country": "USA", "state": "CA"},
      {"country": "USA", "state": "TX"}
    ]
  }
}
```

Add one of those filter blocks to your downstream award-search endpoint's validated request template, such as `POST /api/v2/search/spending_by_award/`, along with that endpoint's own required paging, sorting, and field-selection keys.

Do **not** copy the uncoded row (`shape_code: null`, `display_name: null`) into a state filter. That row represents spending that could not be assigned to a coded geography bucket, so it needs a broader or different follow-up query.

## Validation behavior to handle
Live probes confirmed two important DEFC validation behaviors:
- `filter.def_codes: []` returned **422** with a minimum-items error
- `filter.def_codes: ["l"]` returned **400** and listed the valid uppercase DEFC codes

So clients should handle both `400` and `422` for bad requests.

## Caveats
- The staged docs conflict internally: one schema block says the request is a string, but live probes confirm the endpoint expects an object body.
- This run reverified only the **state** layer. `county`, `district`, `face_value_of_loan`, and shared-filter passthrough fields remain documented or inferred rather than re-probed here.
- Returned geography rows are aggregates, not award records.

## Practical workflow
1. Choose the DEFC set and spending measure.
2. Pick the geography grain with `geo_layer`.
3. Decide whether the geography should reflect the recipient or place of performance using `scope`.
4. Use `geo_layer_filters` to keep interactive map requests bounded.
5. Use the returned `shape_code` values to drive mapping or to seed a second award-level query.
