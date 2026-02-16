# Count of Recipients Receiving Disaster/Emergency Funding – Semantic Guide

## What this endpoint does
Counts the number of distinct recipients that received disaster or emergency funding matching the submitted filters. The service requires at least one valid DEF code and returns a single count.

---

## How to call it
- **Method & path:** `POST /api/v2/disaster/recipient/count/`
- **Auth:** None required in observed probes.
- **Body JSON:**
  - `filter.def_codes` (array<string>, required) – provide at least one uppercase DEF code from the validator list (`'1'`, `AA*`, `L`, `QQQ`, etc.); missing or empty triggers HTTP 422, invalid values trigger HTTP 400 with a detailed message.
  - `filter.award_type_codes` (array<string>, optional) – when present, must include at least one value from `['-1','02','03','04','05','06','07','08','09','10','11','A','B','C','D','IDV_A','IDV_B','IDV_B_A','IDV_B_B','IDV_B_C','IDV_C','IDV_D','IDV_E']`; empty arrays or non-arrays error.
  - `filter.time_period` (array, optional) – accepted (even as stray strings) but produced no observable effect on counts.
  - `filter.recipient_scope` (string, optional) – accepted but behaved as a no-op.
  - `filter.recipient_locations` (array, optional) – accepted but behaved as a no-op.
  - `filter.keywords` (array<string>, optional) – accepted but behaved as a no-op.
  - Unknown filter keys are tolerated and ignored.

---

## How to interpret the response
- Successful responses are objects containing `count` (integer) representing the number of matching recipients.
- `count` was always present and non-negative in observed 200 responses.
- Validation failures return JSON with a `detail` string and HTTP 400 (type/enum issues) or 422 (missing `filter.def_codes`).

---

## Known doc mismatches
- Docs restrict `def_codes` to `[L, M, N, O, P, U]`, but the API accepts a much broader uppercase list including numeric and `AA*` codes.
- Docs omit `-1` from `award_type_codes`, yet the validator allows `-1`.

---

## Pitfalls & safe-usage checklist
- **Do:** validate DEF codes against the API-enforced list before sending requests.
- **Do:** handle HTTP 400 and 422 validation responses separately.
- **Don't:** rely on shared filters (`time_period`, `recipient_scope`, `recipient_locations`, `keywords`) to refine results until you confirm behavior in your environment.
- **Don't:** assume unknown filter keys will raise errors—they are silently ignored.

---

## Runnable examples
```http
POST /api/v2/disaster/recipient/count/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": {
    "def_codes": ["L", "M"]
  }
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "count": 3692
}
```
