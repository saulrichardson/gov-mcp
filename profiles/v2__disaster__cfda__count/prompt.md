# CFDA Disaster Count – Semantic Guide

## What this endpoint does

Counts distinct CFDA programs tied to the specified Disaster Emergency Fund (DEFC) codes, optionally narrowing the tally with assistance award type codes. Extra filter keys are accepted but ignored.

---

## How to call it

- **Method & path:** `POST /api/v2/disaster/cfda/count/`
- **Auth:** None observed in probes.
- **Body parameters:**
  - `filter.def_codes` (body, array[string], required) – One or more uppercase DEFC codes from the observed enum (`1`, `2`, …, `AAL`, `QQQ`, `Z`). Empty arrays, null, or non-string items return validation errors.
  - `filter.award_type_codes` (body, array[string], optional) – If supplied, include at least one of `-1`, `02`–`11`. Null or empty arrays are rejected; omit to search all types.
  - Additional top-level keys or filter members are accepted but do not affect results.

---

## How to interpret the response

- Returns a JSON object with a single `count` field (non-negative integer) representing the number of matching CFDA programs.
- No pagination or metadata is returned; the endpoint just reports the aggregate count.

---

## Known doc mismatches

- Docs limit AssistanceAwardTypeCodes to `02`–`11`, but the API also accepts `-1`.
- Docs frame DEFC as CARES Act codes only, yet validation also allows numeric values and `QQQ`.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Provide at least one valid, uppercase DEFC code to avoid 422 errors.
  - Handle both HTTP 400 and 422 responses for validation feedback.
- **Don’t:**
  - Don’t rely on extra filters (e.g., `program_numbers`, `time_period`) to constrain results—they are ignored.
  - Don’t lowercase or cast DEFC entries to numbers; non-string values are rejected.

---

## Runnable examples

```http
POST /api/v2/disaster/cfda/count/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"filter":{"def_codes":["L","M","N"]}}
```

- Responds with `{"count":323}` for the observed dataset.
- Reusing the same DEFC array with an additional `"award_type_codes":["06"]` narrows the result to `{"count":2}`.
