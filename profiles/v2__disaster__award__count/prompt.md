# Disaster Award Count – Semantic Guide

## What this endpoint does

Returns the integer count of awards that received disaster or emergency funding, constrained by at least one DEF code and optionally narrowed to specific award types.

---

## How to call it

- **Method & path:** `POST /api/v2/disaster/award/count/`
- **Auth:** None required in observed probes.
- **Headers:** `Content-Type: application/json`
- **Body:**
  - `filter` (object, required) – wrapper for all criteria. Must be a JSON object; null, arrays, or scalars trigger a 422 missing-field error. Extra keys are ignored.
    - `def_codes` (array of string, required) – uppercase DEF codes. Accepted values include digits `1-9`, letters `A-Z`, and multi-letter codes surfaced in validation errors (e.g., `AAA`, `AAB`, `AAL`, `QQQ`). Must contain at least one item; invalid codes return 400.
    - `award_type_codes` (array of string, optional) – restricts results to awards linked through File D. Allowed values: `-1`, `02`, `03`, `04`, `05`, `06`, `07`, `08`, `09`, `10`, `11`, `A`, `B`, `C`, `D`, `IDV_A`, `IDV_B`, `IDV_B_A`, `IDV_B_B`, `IDV_B_C`, `IDV_C`, `IDV_D`, `IDV_E`. Must be non-empty when present; null is treated as absent.
  - Other shared filters (e.g., `time_period`, `keywords`, `agencies`) are accepted but observed to have no impact on the count.

---

## How to interpret the response

- Response body is a JSON object.
- `count` (integer) – total number of awards matching the provided filters.
- No pagination or metadata fields are returned.

---

## Known doc mismatches

- Docs imply DEF codes are limited to CARES Act entries, but validation accepts a broader set including digits and multi-letter codes.
- Docs omit the `-1` award type code, yet the API accepts it (with zero results when used alone).

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate DEF codes against the allowed list returned in 400 errors to avoid silent miscounts.
  - Handle both 422 (structural issues) and 400 (invalid values) when surfacing validation feedback.
- **Don’t:**
  - Don’t assume additional filters like `time_period` or `keywords` affect results; observed behavior ignores them.
  - Don’t rely on the undocumented `-1` award type without confirming its meaning for your workflow.

---

## Runnable examples

```http
POST /api/v2/disaster/award/count/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": {
    "def_codes": ["L"],
    "award_type_codes": ["A"]
  }
}
```

- Returns a JSON object such as `{ "count": 183 }`.
- Providing invalid DEF codes (e.g., `"ZZ"`) yields a 400 with the allowed-values list in the error detail.
