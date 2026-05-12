# Award Funding Rollup (`v2__awards__funding_rollup`)

## When to use this endpoint
Use this endpoint when you already know one award identifier and want a **quick funding footprint summary** for that award:
- total transaction obligated amount
- count of distinct awarding agencies
- count of distinct funding agencies
- count of distinct federal accounts

Live availability was confirmed on 2026-05-12 with a successful `POST /api/v2/awards/funding_rollup/` call.

## When not to use it
- Do **not** use it for row-level funding detail by reporting period, agency, account, object class, or program activity.
- Do **not** use it to search across many awards; the request is scoped to one `award_id`.
- Do **not** expect pagination or sorting behavior. The docs sample body shows `page`, `sort`, `order`, and `limit`, but source and current-profile evidence indicate those fields are ignored.
- Do **not** treat an all-zero response as proof that the award identifier is valid. Current-profile evidence indicates unknown award ids can still return `200` with zeros.

## Request shape
**Method:** `POST`  
**Path:** `/api/v2/awards/funding_rollup/`  
**Content-Type:** `application/json`

### Required body field
- `award_id` — required. Source code accepts either:
  - a generated award id string such as `CONT_AWD_...`
  - an integer internal award id

In normal workflows, the generated award id string is the safer/common choice.

### Legacy doc-only fields to avoid
The staged docs sample body also shows:
- `page`
- `sort`
- `order`
- `limit`

Keep them in mind only as a **documented contradiction**. Source and current-profile evidence indicate the implementation reads only `award_id`, and the endpoint always returns a single aggregate object.

### Primary safe request template
```json
{
  "award_id": "CONT_AWD_DEAC5206NA25396_8900_-NONE-_-NONE-"
}
```

## Response shape
The response is a single JSON object with four top-level fields:
- `total_transaction_obligated_amount`
- `awarding_agency_count`
- `funding_agency_count`
- `federal_account_count`

Observed live example:
```json
{
  "total_transaction_obligated_amount": 2729344672.23,
  "awarding_agency_count": 1,
  "funding_agency_count": 1,
  "federal_account_count": 17
}
```

## How to interpret the fields
- `total_transaction_obligated_amount` is an aggregate sum across revealed `financial_accounts_by_awards` records linked to the award.
- `awarding_agency_count` is a distinct count of awarding top-tier agencies, not a row count.
- `funding_agency_count` is a distinct count of funding top-tier agencies, not a row count.
- `federal_account_count` is a distinct count of federal-account combinations, not a transaction count.

Treat the three count fields as **breadth indicators** for the award's funding footprint.

## Practical workflow
1. Obtain a valid `award_id` for the award you care about.
2. Send a minimal JSON body with only `award_id`.
3. Read the rollup as a one-row summary of funding breadth for that award.
4. If you need detailed funding/accounting rows, continue with a more detailed award-funding analysis endpoint rather than expecting this route to page or sort.

## Caveats
- The docs sample body is misleading about `page`, `sort`, `order`, and `limit`; treat them as ignored legacy fields for this route.
- Unknown or bad award ids may return `200` with all zeros instead of an error.
- The total can be negative for some awards.
- The aggregation is based on revealed File C funding records, so it should be interpreted as a funding-data rollup rather than a generic award metadata summary.
