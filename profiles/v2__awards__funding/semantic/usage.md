# Award Funding (`v2__awards__funding`)

## When to use this endpoint
Use this endpoint when you already know one award handoff identifier and need the award's federal account funding rows: reporting-period context, funding and awarding agencies, federal account identifiers, object class, program activity, and obligated/outlay amounts.

In cross-endpoint workflows, normalize the handoff identifier as `canonical_award_lookup_id`:
- `v2__search__spending_by_award` exposes it as `generated_internal_id`
- `v2__awards__award_id` returns the same business key as `generated_unique_award_id`
- this endpoint expects that same value under request body field `award_id`

Live availability was confirmed on 2026-05-10 with a successful `POST /api/v2/awards/funding/` call.

## When not to use it
- Do not use it to search across many awards; it only accepts one `award_id` per request.
- Do not use it when you need a total row count up front; page metadata does not include a total count.
- Do not treat each row as a deduplicated award total. Results are accounting slices by reporting period and classification fields.
- Do not expect funding rows to restate the headline `total_obligation` from award detail. Sparse results can align more closely with `total_account_obligation` instead.
- Do not substitute the display `Award ID` from spending_by_award when `canonical_award_lookup_id` is available.

## Request shape
**Method:** `POST`
**Path:** `/api/v2/awards/funding/`
**Content-Type:** `application/json`

### Canonical award handoff id
For cross-endpoint award drilldowns, use the semantic alias `canonical_award_lookup_id`.

Map that alias like this:
- `v2__search__spending_by_award` result: `generated_internal_id`
- `v2__awards__award_id` response: `generated_unique_award_id`
- `v2__awards__funding` request: send the same value as body `award_id`

Example mapping from the reviewer-backed drilldown:
- display `Award ID`: `HT940216C0001`
- `canonical_award_lookup_id`: `CONT_AWD_HT940216C0001_9700_-NONE-_-NONE-`

### Body fields
- `award_id` — required. In semantic workflows, treat this field as the carrier for `canonical_award_lookup_id`. If you are chaining from `v2__search__spending_by_award`, pass `generated_internal_id` unchanged here. If you are chaining from `v2__awards__award_id`, pass `generated_unique_award_id` unchanged here. Generated award ids are preferred; docs also allow deprecated numeric surrogate ids.
- `limit` — optional page size. Docs say default `10`. Live probe confirmed that `limit: 4` returned four rows.
- `page` — optional 1-based page number. Docs say default `1`. Reviewer-confirmed safe-template evidence showed `page: 1` returning `200` and echoing `page_metadata.page: 1`.
- `sort` — optional sort field. Documented values: `account_title`, `awarding_agency_name`, `disaster_emergency_fund_code`, `federal_account`, `funding_agency_name`, `gross_outlay_amount`, `object_class`, `program_activity`, `reporting_fiscal_date`, `transaction_obligated_amount`. For deterministic pagination or comparison work, treat explicit `sort` as the safe pattern and do not rely on the omitted default.
- `order` — optional sort direction: `asc` or `desc`. Use it together with explicit `sort` in the safe request pattern; reviewer-confirmed safe-template evidence showed `order: "desc"` returning `200`.

### Primary safe request template
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

Send `canonical_award_lookup_id` under `award_id`, and set `sort` and `order` explicitly when ordering matters. The contradiction is in the undocumented default behavior when `sort` is omitted, not in the explicit documented sort values. Reviewer-confirmed safe-template evidence succeeded with `page: 1`, `sort: "reporting_fiscal_date"`, and `order: "desc"`.

## Response shape
The response is a JSON object with:
- `results`: array of funding rows
- `page_metadata`: pagination metadata

Each funding row is observed/documented to include:
- reporting fiscal year / quarter / month
- `is_quarterly_submission`
- `disaster_emergency_fund_code` as a raw code/string-or-null field, not a boolean flag
- funding and awarding agency ids, names, top-tier ids, and slugs
- `federal_account` and `account_title`
- `program_activity_code` and `program_activity_name`
- `object_class` and `object_class_name`
- `transaction_obligated_amount`
- `gross_outlay_amount`

`page_metadata` includes `page`, `next`, `previous`, `hasNext`, and `hasPrevious`.

## How to interpret the data
Treat each result row as one funding/accounting slice for the requested award, labeled by reporting period and account classification. This endpoint is best for explaining how a known award maps to federal accounts and how obligations/outlays are distributed across reporting periods.

Funding rows may be sparse and may not resemble the award-detail headline total. In the reviewer-backed HT940216C0001 drilldown, award detail reported `total_obligation: 51269205263.03` and `total_account_obligation: 321840`, while this endpoint returned one row with `transaction_obligated_amount: 321840` and `hasNext: false`. Use that pattern as a caution: funding can line up more closely with `total_account_obligation` than with `total_obligation`.

## Practical workflow
1. Obtain `canonical_award_lookup_id`. If you are chaining from `v2__search__spending_by_award`, prefer `generated_internal_id` over the display `Award ID`. If you are chaining from `v2__awards__award_id`, reuse `generated_unique_award_id`.
2. Fetch page 1 by sending `canonical_award_lookup_id` under body field `award_id` plus explicit `sort` and `order`; treat that explicit-sort shape as the primary safe pattern because omitted-sort behavior is contradicted. Reviewer-confirmed evidence showed this exact pattern returning `200`.
3. Read each row's federal account, agency, object class, program activity, and reporting period fields.
4. Continue paging with `page_metadata.next` or while `page_metadata.hasNext` is true.
5. If you compare the response to award detail, treat funding as accounting-slice evidence. Check `total_account_obligation` before assuming the endpoint should reconcile to headline `total_obligation`.

## Caveats
- Related award endpoints relabel the same generated award business key. Keeping the semantic alias `canonical_award_lookup_id` prevents avoidable handoff mistakes.
- The documented default sort does **not** match observed live behavior when `sort` is omitted. Treat omitted `sort` as unsafe for deterministic pagination or comparisons. Explicit documented sort values remain the recommended primary pattern; a reviewer-backed safe-template call succeeded with `sort: "reporting_fiscal_date"` and `order: "desc"`.
- `disaster_emergency_fund_code` should be handled as a raw code/string-or-null field, not a boolean-like flag. Live and reviewer-backed evidence returned `null` and the string code `Q`.
- `gross_outlay_amount` may be `null` on valid rows.
- Sparse funding is not automatically a join failure. Reviewer-backed drilldown showed a 51269205263.03 award whose funding response contained one 321840 row and `hasNext: false`, matching `total_account_obligation` much more closely than `total_obligation`.
- Current-profile evidence suggests unknown award ids may return `200` with empty `results`, so check empty arrays carefully.
