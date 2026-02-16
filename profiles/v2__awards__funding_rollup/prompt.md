# Award Funding Rollup – Semantic Guide

## What this endpoint does

Returns total transaction obligations plus counts of distinct awarding agencies, funding agencies, and federal accounts tied to a single award identifier. Unknown or malformed identifiers do not fail but produce zeroed aggregates.

---

## How to call it

- **Method & path:** `POST /api/v2/awards/funding_rollup/`
- **Auth:** None required in observed probes.
- **Parameters:**
  - `award_id` (body, string or integer, required) – identifier for the target award; leading/trailing whitespace is trimmed. Floats, booleans, null, arrays, and objects return HTTP 422. Unknown or whitespace-only values return HTTP 200 with zero totals. Extra body keys are ignored.

---

## How to interpret the response

- JSON object with four required fields: `total_transaction_obligated_amount` (number, may be negative), `awarding_agency_count`, `funding_agency_count`, and `federal_account_count` (integers).
- The object represents a single aggregate record; there is no pagination or list wrapper.

---

## Known doc mismatches

- Documentation shows `page`, `sort`, `order`, and `limit` in the request body, but the live endpoint ignores these fields and always emits one aggregate record.

---

## Pitfalls & safe-usage checklist

- **Do:** Trim and validate award identifiers before calling so you can distinguish missing data from real zeroes.
- **Do:** Send `Content-Type: application/json`; other media types return HTTP 415.
- **Don’t:** Assume negative obligations are errors—observed data can be negative.
- **Don’t:** Rely on extra body fields to influence the response; they have no effect.

---

## Runnable examples

```http
POST /api/v2/awards/funding_rollup/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"award_id":"CONT_AWD_DEAC5206NA25396_8900_-NONE-_-NONE-"}
```

- Returns aggregate totals for the specified award (`total_transaction_obligated_amount`, `awarding_agency_count`, `funding_agency_count`, `federal_account_count`).
