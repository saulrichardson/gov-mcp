# DEF Code Count – Semantic Guide

## What this endpoint does
Counts how many of the supplied Disaster Emergency Fund (DEFC) codes currently have disaster/emergency funding. Returns 0 when none of the requested codes qualify.

---

## How to call it
- **Method & path:** `POST /api/v2/disaster/def_code/count/`
- **Auth:** None required in the observed probes.
- **Parameters:**
  - `filter.def_codes` (body, array[string], required) – Uppercase DEFC values from `['1','2','3','4','5','6','7','8','9','A','AAA','AAB','AAC','AAD','AAE','AAF','AAG','AAH','AAI','AAJ','AAK','AAL','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','QQQ','R','S','T','U','V','W','X','Y','Z']`; at least one entry. Duplicates are allowed but deduplicated. Extra keys inside `filter` (such as `time_period` or `agencies`) are ignored.

---

## How to interpret the response
- Response is an object containing a single `count` field.
- `count` is a number representing the distinct requested DEFC codes that currently have funding; it drops to 0 when none qualify.
- No pagination or supplemental metadata has been observed.

---

## Known doc mismatches
- None observed.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Send `Content-Type: application/json` so the body is parsed.
  - Validate DEFC inputs against the allowed list before calling to avoid 400 errors.
  - Expect counts to fluctuate alongside live disaster funding data.
- **Don’t:**
  - Don’t rely on optional filters like `time_period` to constrain results; the endpoint ignores them.
  - Don’t mix invalid DEFC values with valid ones—the entire request is rejected.

---

## Runnable examples
```http
POST /api/v2/disaster/def_code/count/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": {
    "def_codes": ["L", "M"]
  }
}
```

- Returns `{ "count": 2 }` when both codes currently have qualifying funding.
