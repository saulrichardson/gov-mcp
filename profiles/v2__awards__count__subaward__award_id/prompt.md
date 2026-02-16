# Subaward Count – Semantic Guide

## What this endpoint does
Returns the integer count of subawards tied to a prime award identified by its generated_unique_award_id. Successful calls have returned both zero and non-zero counts with the `subawards` field present.

---

## How to call it
- **Method & path:** `GET /api/v2/awards/count/subaward/{award_id}/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `award_id` (path, string, required) – exact generated_unique_award_id for the prime award; casing must match the canonical form and the trailing slash must be included.

---

## How to interpret the response
- Response is a JSON object containing `subawards`.
- `subawards` is a non-negative integer count of subawards linked to the provided prime award.
- A valid award with no subawards still returns `subawards: 0`.

---

## Known doc mismatches
- Documentation lists `ASST_NON_NNX17AJ96A_8000` as a working example, but production returns `404` with `{"detail":"No Award found with: 'ASST_NON_NNX17AJ96A_8000'"}`.

---

## Pitfalls & safe-usage checklist
- **Do:** Resolve the official generated_unique_award_id before calling; nearby permutations return 404.
- **Do:** Keep the trailing slash and original casing to avoid redirects or HTML 404 payloads.
- **Don’t:** Substitute PIID/FAIN or other identifiers in place of the generated_unique_award_id; they return JSON 404 detail.

---

## Runnable examples
```http
GET /api/v2/awards/count/subaward/CONT_AWD_7200AA23F50027_7200_7200AA22A00006_7200/ HTTP/1.1
Host: api.usaspending.gov
```

- Returns `{"subawards":3}` when the award has three subawards.
- Reusing the same request with a different valid award can return `{"subawards":0}` when no subawards exist.
