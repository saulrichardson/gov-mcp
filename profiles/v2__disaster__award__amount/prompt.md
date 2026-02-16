# Disaster Award Amount – Semantic Guide

## What this endpoint does
Aggregates award counts, obligations, outlays, and loan face values for awards linked to the supplied Disaster Emergency Fund (DEFC) codes. Optional award-type selectors adjust the population, while several other legacy filters are currently tolerated but ignored.

---

## How to call it
- **Method & path:** `POST /api/v2/disaster/award/amount/`
- **Auth:** None required in observed probes.
- **Body fields:**
  - `filter.def_codes` (array of strings, required) – Provide at least one uppercase DEFC drawn from the server-enforced list (`'1'..'9','A','AAA',…,'Z'`). Empty arrays or lowercase entries fail validation.
  - `filter.award_type_codes` (array of strings, optional) – Limit to specific procurement/assistance codes (`'-1','02','03',…,'IDV_E'`); must not be combined with `filter.award_type`.
  - `filter.award_type` (string, optional) – Use `'assistance'` or `'procurement'` to pivot aggregates; mutually exclusive with `filter.award_type_codes` and case-sensitive.
  - `filter.time_period` (array/object/string/null, optional) – Accepted without error but ignored; include only if you can tolerate no effect.
  - `filter.keywords` (array or string, optional) – Accepted but ignored.
  - `filter.recipient_scope` (string, optional) – Any value accepted; no observed impact.
  - `pagination` (object, optional) – Accepted yet ignored; endpoint always returns one aggregate payload.
  - `spending_type` (string or null, optional) – Accepted but does not change results.

---

## How to interpret the response
- Response is a single JSON object.
- `award_count` is the number of matched awards (returned as a numeric field).
- `obligation` and `outlay` are aggregated monetary totals; values can be very large floats.
- `face_value_of_loan` appears only when loan awards contribute; omit-safe for non-loan populations.
- No pagination metadata is returned; every call yields one aggregate record.

---

## Known doc mismatches
- Documentation promises pagination controls, but the live API ignores them and returns one aggregate object.
- `spending_type` is documented as changing aggregation focus, yet every value is ignored.
- Shared filter docs describe strict validation for fields like `recipient_scope` and `time_period`, but the live API accepts arbitrary values without applying them.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Always validate DEFC inputs client-side to avoid 400/422 responses.
  - Confirm whether you need award-level or account-level filtering elsewhere, because most supplemental filters here are inert.
  - Treat large monetary outputs as high-precision values in downstream systems.
- **Don’t:**
  - Don’t rely on `spending_type`, `time_period`, or `keywords` to constrain results until the service starts honoring them.
  - Don’t send both `award_type` and `award_type_codes`; the server rejects the combination.
  - Don’t expect pagination metadata; plan around a single aggregate response per request.

---

## Runnable examples
```http
POST /api/v2/disaster/award/amount/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": {
    "def_codes": ["L"],
    "award_type_codes": ["08"]
  }
}
```

- Returns a single aggregate object with `award_count`, `obligation`, `outlay`, and (when applicable) `face_value_of_loan`.
- Remove `award_type_codes` or swap to `award_type` if you need broader award categories, but never include both.
