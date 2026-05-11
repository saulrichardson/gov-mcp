# Spending Over Time

Use `v2__search__spending_over_time` for aggregate trend questions over a filtered USAspending population. The result grain is one time bucket, not one award or recipient.

Prefer canonical `group` values:

```json
{
  "group": "fiscal_year",
  "filters": {
    "award_type_codes": ["A", "B", "C"],
    "time_period": [
      {
        "start_date": "2023-10-01",
        "end_date": "2025-09-30"
      }
    ]
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

The legacy `subawards` boolean is still documented, but live responses warn that callers should set `spending_level` instead. Search date ranges are also constrained by the live service; responses warn that advanced-search time periods are limited to an earliest date of `2007-10-01`.

Use this endpoint to identify periods worth investigating, then reuse compatible `filters` on `v2__search__spending_by_award` to fetch award-level rows for a selected period.
