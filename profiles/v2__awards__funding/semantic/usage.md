# Award Funding (`v2__awards__funding`)

## When to use this endpoint
Use this endpoint when you already know a single `award_id` and need the award's federal account funding rows: reporting-period context, funding and awarding agencies, federal account identifiers, object class, program activity, and obligated/outlay amounts.

Live availability was confirmed on 2026-05-10 with a successful `POST /api/v2/awards/funding/` call.

## When not to use it
- Do not use it to search across many awards; it only accepts one `award_id` per request.
- Do not use it when you need a total row count up front; page metadata does not include a total count.
- Do not treat each row as a deduplicated award total. Results are accounting slices by reporting period and classification fields.

## Request shape
**Method:** `POST`
**Path:** `/api/v2/awards/funding/`
**Content-Type:** `application/json`

### Body fields
- `award_id` — required. Generated award ids are preferred; docs also allow deprecated numeric surrogate ids.
- `limit` — optional page size. Docs say default `10`. Live probe confirmed that `limit: 4` returned four rows.
- `page` — optional 1-based page number. Docs say default `1`. Reviewer-confirmed safe-template evidence showed `page: 1` returning `200` and echoing `page_metadata.page: 1`.
- `sort` — optional sort field. Documented values: `account_title`, `awarding_agency_name`, `disaster_emergency_fund_code`, `federal_account`, `funding_agency_name`, `gross_outlay_amount`, `object_class`, `program_activity`, `reporting_fiscal_date`, `transaction_obligated_amount`.
- `order` — optional sort direction: `asc` or `desc`. Reviewer-confirmed safe-template evidence showed `order: "desc"` returning `200`.

### Safe request template
This same request shape is exported for MCP callers through `getRequestTemplate` as the safe-template request template.

```json
{
  "award_id": "CONT_AWD_0002_2800_SS001740003_2800",
  "page": 1,
  "limit": 10,
  "sort": "reporting_fiscal_date",
  "order": "desc"
}
```

Set `sort` and `order` explicitly when ordering matters. The documented default sort conflicts with observed live behavior, and reviewer-confirmed safe-template evidence succeeded with `page: 1`, `sort: "reporting_fiscal_date"`, and `order: "desc"`.

## Response shape
The response is a JSON object with:
- `results`: array of funding rows
- `page_metadata`: pagination metadata

Each funding row is observed/documented to include:
- reporting fiscal year / quarter / month
- `is_quarterly_submission`
- `disaster_emergency_fund_code`
- funding and awarding agency ids, names, top-tier ids, and slugs
- `federal_account` and `account_title`
- `program_activity_code` and `program_activity_name`
- `object_class` and `object_class_name`
- `transaction_obligated_amount`
- `gross_outlay_amount`

`page_metadata` includes `page`, `next`, `previous`, `hasNext`, and `hasPrevious`.

## How to interpret the data
Treat each result row as one funding/accounting slice for the requested award, labeled by reporting period and account classification. This endpoint is best for explaining how a known award maps to federal accounts and how obligations/outlays are distributed across reporting periods.

## Practical workflow
1. Start with a known `award_id`.
2. Fetch page 1 with an explicit `sort` and `order`; reviewer-confirmed evidence showed this exact pattern returning `200`.
3. Read each row's federal account, agency, object class, program activity, and reporting period fields.
4. Continue paging with `page_metadata.next` or while `page_metadata.hasNext` is true.

## Caveats
- The documented default sort does **not** match observed live behavior. A live baseline call with `sort` omitted returned `account_title`-grouped rows and showed 2017 before 2022 within the same account, so do not rely on the documented default.
- `disaster_emergency_fund_code` should be handled as a raw code/string-or-null field, not a boolean. Live data returned `null` and the string code `Q`.
- `gross_outlay_amount` may be `null` on valid rows.
- Current-profile evidence suggests unknown award ids may return `200` with empty `results`, so check empty arrays carefully.
