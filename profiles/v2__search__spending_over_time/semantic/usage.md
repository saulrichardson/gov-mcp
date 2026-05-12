# Spending Over Time

Use `v2__search__spending_over_time` for aggregate trend questions over a filtered USAspending population. Each result row is one time bucket, not one award, recipient, or geography row.

## Important request fields

- `group` — use canonical values `calendar_year`, `fiscal_year`, `quarter`, or `month`
- `filters.time_period` — bound the analysis window
- `filters.place_of_performance_scope` — set `domestic` or `foreign` when the trend should match place-of-performance geography
- `filters.recipient_scope` — set `domestic` or `foreign` when the trend should match recipient-location geography
- `spending_level` — defaults to `transactions`; use `awards` or `subawards` when needed

## Labeling returned time buckets

The response `time_period` object is fiscal-period encoded for `month` and `quarter` groupings.

- `group = fiscal_year` → label from `time_period.fiscal_year`
- `group = quarter` → label as `FY{fiscal_year} Q{quarter}`; quarters are fiscal quarters, so `FY2024 Q1` means Oct-Dec 2023, `Q2` means Jan-Mar 2024, `Q3` means Apr-Jun 2024, and `Q4` means Jul-Sep 2024
- `group = month` → `time_period.month` is a fiscal month number inside `time_period.fiscal_year`, not a calendar month number

Fiscal month mapping:

- `1=Oct`, `2=Nov`, `3=Dec`, `4=Jan`, `5=Feb`, `6=Mar`, `7=Apr`, `8=May`, `9=Jun`, `10=Jul`, `11=Aug`, `12=Sep`

Reviewer-reported live example for a bounded monthly request:

```json
{
  "group": "month",
  "filters": {
    "award_type_codes": ["A", "B", "C"],
    "time_period": [
      {
        "start_date": "2024-01-01",
        "end_date": "2024-06-30"
      }
    ],
    "place_of_performance_scope": "domestic"
  }
}
```

Returned `time_period` buckets included `{"fiscal_year":"2024","month":"4"}` through `{"fiscal_year":"2024","month":"9"}` with six monthly rows. Render those as Jan-Jun 2024 on a calendar-month chart, not Apr-Sep 2024. Keep API result order or sort by `(fiscal_year, month)` rather than by `month` alone.

## Same-scope map + trend alignment

If you are pairing this endpoint with `v2__search__spending_by_geography`, set the matching location-scope filter explicitly on the trend request:

- Geography `scope = place_of_performance` → use `filters.place_of_performance_scope`
- Geography `scope = recipient_location` → use `filters.recipient_scope`

For state, county, and district geography maps, the geography route documents a default of `domestic` for the corresponding scope filter. Set the same value explicitly here instead of relying on that default, so the trend and map are truly same-scope. Do not assume an omitted trend scope matches a domestic map; reviewer-reported live calls showed that adding `filters.place_of_performance_scope: "domestic"` materially changed the monthly series.

Example: monthly domestic place-of-performance trend aligned to a state map.

```json
{
  "group": "month",
  "filters": {
    "award_type_codes": ["A", "B", "C"],
    "time_period": [
      {
        "start_date": "2024-01-01",
        "end_date": "2024-06-30"
      }
    ],
    "place_of_performance_scope": "domestic"
  }
}
```

The live API also accepts `cy`, `fy`, `q`, and `m`, but generated requests should use `calendar_year`, `fiscal_year`, `quarter`, or `month`. Invalid group values return a 400 with the live enum list.

For subaward trends, use `spending_level: "subawards"`:

```json
{
  "group": "quarter",
  "spending_level": "subawards",
  "filters": {
    "time_period": [
      {
        "start_date": "2023-10-01",
        "end_date": "2024-09-30"
      }
    ],
    "award_type_codes": ["A", "B", "C", "D"]
  }
}
```

Quarter responses are fiscal as well, so `{"fiscal_year":"2024","quarter":"1"}` should be labeled `FY2024 Q1` rather than calendar Q1 2024.

The legacy `subawards` boolean is still documented, but live responses warn that callers should set `spending_level` instead. Search date ranges are also constrained by the live service; responses warn that advanced-search time periods are limited to an earliest date of `2007-10-01`.

Use this endpoint to identify periods worth investigating, then reuse compatible `filters` on `v2__search__spending_by_award` to fetch award-level rows for a selected period or on `v2__search__spending_by_geography` to build a same-scope map.
