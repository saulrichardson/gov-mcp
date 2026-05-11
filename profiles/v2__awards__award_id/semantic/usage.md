# Award Detail (`v2__awards__award_id`)

## When to use this endpoint
Use this endpoint when you already know a specific USAspending award identifier and need the award-profile payload for that one award: identifiers, recipient and agency context, award-level financial summary fields, and category-specific contract/IDV or assistance details.

In cross-endpoint workflows, normalize the handoff identifier as `canonical_award_lookup_id`:
- `v2__search__spending_by_award` exposes it as `generated_internal_id`
- this endpoint accepts it as path field `award_id`
- this endpoint returns the same business key as `generated_unique_award_id`
- `v2__awards__funding` expects the same value under request body field `award_id`

Live availability was confirmed on 2026-05-11 with a successful `GET /api/v2/awards/CONT_AWD_H907_9700_SPE2DX16D1500_9700/` call.

## When not to use it
- Do not use it to search across awards; it returns one award object for one path identifier.
- Do not use it as a transaction listing or award-funding history endpoint.
- Do not treat the display `Award ID` label from search results as the canonical follow-up identifier when a generated helper id is available; carry `canonical_award_lookup_id` instead.

## Request shape
**Method:** `GET`
**Path:** `/api/v2/awards/{award_id}/`

### Path field
- `award_id` — required. Docs say it accepts a generated award hash or an internal database id.
- In semantic workflows, treat this path field as the carrier for `canonical_award_lookup_id`.
- If you are chaining from `v2__search__spending_by_award`, take `generated_internal_id` and pass it here unchanged.
- Source code distinguishes digit-only values from string award ids and retries a legacy generated-award-id lookup when the string lookup misses.
- Current-profile evidence indicates the canonical route includes a trailing slash and preserves case.

### Request templates
Generated-id example:
```http
GET /api/v2/awards/CONT_AWD_H907_9700_SPE2DX16D1500_9700/ HTTP/1.1
Host: api.usaspending.gov
```

Numeric-id example:
```http
GET /api/v2/awards/306293964/ HTTP/1.1
Host: api.usaspending.gov
```

## Response shape
The response is one JSON object for the requested award.

Common fields observed/documented on the live contract sample include:
- `id`, `generated_unique_award_id`, `category`, `type`, `type_description`, `description`
- `total_obligation`, `subaward_count`, `total_subaward_amount`
- `awarding_agency`, `funding_agency`, `recipient`
- `period_of_performance`, `place_of_performance`, `executive_details`
- `total_account_outlay`, `total_account_obligation`, `account_outlays_by_defc`, `account_obligations_by_defc`
- `total_outlay` (returned as `null` in the live contract sample; docs describe it inconsistently)

Treat `generated_unique_award_id` as this endpoint's response label for `canonical_award_lookup_id`. If you continue to `v2__awards__funding`, send that same string unchanged under the funding request body field `award_id`.

Category-specific sections:
- **Contracts / IDVs:** `piid`, `latest_transaction_contract_data`, `parent_award`, `naics_hierarchy`, `psc_hierarchy`
- **Assistance / loans / direct payments / grants:** `record_type`, `fain`, `uri`, `cfda_info`, `funding_opportunity`, and category-specific funding or loan totals

## How to interpret it
Treat the payload as an award-detail summary object, not as a rowset. The endpoint combines one award's identifying information with nested business context.

Check `category` first:
- procurement branches add contract-detail, classification, and parent-award sections
- assistance branches add CFDA and funding-opportunity sections and may include assistance- or loan-specific financial totals

`total_account_outlay` and `total_account_obligation` come from DEFC/account rows. `total_outlay` is a separate award-level outlay measure and should not be assumed equivalent.

## Practical workflow
1. Obtain `canonical_award_lookup_id`. If you are chaining from `v2__search__spending_by_award`, prefer `generated_internal_id` over the display `Award ID`.
2. Call `GET /api/v2/awards/{award_id}/` with `canonical_award_lookup_id` in the path and keep the trailing slash.
3. Inspect `category` before reading nested fields.
4. When you need other award-specific drilldowns, reuse `generated_unique_award_id` as the same `canonical_award_lookup_id` even if the downstream request field is also named `award_id`.

## Caveats
- Related award endpoints relabel the same generated award business key; keeping the semantic alias `canonical_award_lookup_id` prevents avoidable handoff mistakes.
- The docs are inconsistent about `funding_opportunity` naming; the structure section misspells it as `funding_opportunty`.
- The docs are also inconsistent about `total_outlay` across award families, but the live contract response included the field.
- Current-profile evidence indicates some invalid string paths can return HTML 404 pages instead of JSON errors.
