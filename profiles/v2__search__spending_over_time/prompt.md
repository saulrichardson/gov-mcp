# Spending Over Time

Use `POST /api/v2/search/spending_over_time/` when the goal is to inspect aggregate spending trends over time instead of individual awards.

## Required body fields
- `group`
- `filters`

## Observed group values
- Canonical values: `calendar_year`, `fiscal_year`, `quarter`, `month`
- Production also accepts undocumented aliases: `cy`, `fy`, `q`, `m`

## Practical filter guidance
- `filters.time_period` is strongly recommended for bounded analyses
- `filters.award_type_codes` works for scoped contract/assistance slices
- `filters.agencies` was observed working with shapes like `[{ "type": "awarding", "tier": "toptier", "name": "Department of Agriculture" }]`
- `filters.recipient_search_text` was observed working as a single-item list when the value is a canonical recipient name, DUNS, or UEI
- Keyword-only filters are accepted, but they can produce very broad series

## Output shape
- `group`
- `spending_level`
- `results`
- `messages`

## Interpretation notes
- Each result row contains `time_period` plus `aggregated_amount` and category-specific obligation columns.
- Observed successful responses returned nullable outlay fields as `null`, so treat outlays as unavailable unless you verify otherwise.
- Award or subaward trend requests may return extra buckets outside the requested range; the API warns about this explicitly.

## Do
- Prefer canonical group names in client code even though aliases work.
- Use explicit date bounds to keep the series interpretable.
- Expect ascending time order from earliest to latest.
- For recipient trend work, prefer a canonical value from `POST /api/v2/recipient/` such as `name`, `duns`, or `uei`.

## Don't
- Don’t request dates earlier than `2007-10-01`; production returns HTTP 422.
- Don’t assume the docs’ `Grant_outlays` spelling matches production; live responses use `Grant_Outlays`.
- Don’t assume recipient autocomplete display text will map 1:1 to `recipient_search_text`; `LOCKHEED MARTIN CORPORATION` returned an empty series while `LOCKHEED MARTIN CORP`, DUNS, and UEI all returned data.
