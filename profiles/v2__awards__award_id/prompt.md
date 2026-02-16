# Awards Profile – Semantic Guide

## What this endpoint does
Returns the full award profile for a single award, spanning contracts, IDVs, and financial assistance records, keyed by its generated hash or internal id. The payload mirrors the data shown on USAspending award profile pages and surfaces category-specific metadata.

---

## How to call it
- **Method & path:** `GET /api/v2/awards/{award_id}/`
- **Auth:** No auth observed in probes.
- **Parameters:**
  - `award_id` (path, string, required) – Case-sensitive identifier; accepts generated hashes or numeric ids. Always include the trailing slash or you will receive a 301 redirect. Invalid numeric ids return JSON 404s, while malformed strings return HTML 404 pages.

---

## How to interpret the response
- The response is an object containing core award fields and category-specific sections.
- All payloads include identifiers (`id`, `generated_unique_award_id`), financial totals (`total_obligation`, account totals), recipient data, performance periods, DEFC arrays (often empty), and executive_details.
- Contracts and IDVs include `piid`, `latest_transaction_contract_data`, and NAICS/PSC hierarchies; assistance payloads omit these and instead supply `fain`, `cfda_info`, `funding_opportunity`, and assistance funding totals. Check `category` before reading nested objects.
- Assistance hashes in the URL may be normalized before being echoed back in `generated_unique_award_id`.

---

## Known doc mismatches
- Documentation spells the assistance field as `funding_opportunty`, but the live payload uses `funding_opportunity` with `number` and `goals` keys.
- Docs mark `funding_agency` as required for assistance, yet observed grant payloads return it as null.
- The published schema omits the `total_outlay` field that appears (null) in live responses.

---

## Pitfalls & safe-usage checklist
- **Do:** Inspect `category` and branch your parsing logic for contract/IDV versus assistance data.
- **Do:** Follow redirects or include the trailing slash to avoid losing the request to a 301.
- **Don’t:** Assume error payloads are always JSON; malformed award ids return HTML 404 pages.

---

## Runnable examples
```http
GET /api/v2/awards/CONT_AWD_H907_9700_SPE2DX16D1500_9700/ HTTP/1.1
Host: api.usaspending.gov
```
- Returns a contract payload with populated `latest_transaction_contract_data`.
- `account_outlays_by_defc` and `account_obligations_by_defc` are present but may be empty.
- Expect `total_outlay` to appear even though it is currently null.
