# Allocation Transfer Agency Autocomplete – Semantic Guide

## What this endpoint does
Returns Allocation Transfer Agency (ATA) suggestions used by the USAspending Treasury Account autocomplete. Results reflect the live dataset and arrive sorted by ATA, optionally filtered by treasury account components.

---

## How to call it
- **Method & path:** `POST /api/v2/autocomplete/accounts/ata/`
- **Auth:** Not required in observed probes.
- **Body parameters:**
  - `filters` (object, optional) – Supply treasury account component keys. `ata` accepts a non-empty string prefix match or `null` to surface accounts missing an ATA. `aid` matches the provided agency identifier; empty strings are rejected with 422. Keys `bpoa`, `epoa`, `a`, `main`, and `sub` are accepted but their matching behavior is unverified. Missing, null, string, or array values for `filters` fall back to the default suggestions, and unknown keys are ignored.
  - `limit` (integer, optional) – Defaults to `10`. Accepts integers `0–500` inclusive (digit strings are coerced). Values `>500` return 422, negative integers raise an HTML 500 error, and non-integer types (floats, alphabetic strings, `null`) return 400.

---

## How to interpret the response
- Response is an object with a `results` array sorted by `ata`.
- Each result provides `ata`, `agency_name`, and `agency_abbreviation`, each possibly `null`.
- When filters allow accounts missing an ATA, the final row may be a placeholder where all three fields are `null`; handle it explicitly if those rows are not useful.

---

## Known doc mismatches
- Docs declare `filters` required, but the API accepts missing, null, string, or array filters and simply returns the default suggestions.
- Docs describe `limit` as an unrestricted number, while the API enforces an integer-only range of `0–500` and rejects floats.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Validate `limit` client-side to stay within `0–500` and avoid the server-side 500 error path.
  - Guard against placeholder rows with all-null fields when including filters that admit missing ATAs.
- **Don’t:**
  - Don’t assume malformed `filters` will be rejected; they silently fall back to default results and can mask mistakes.
  - Don’t rely on unverified filter keys (`bpoa`, `epoa`, `a`, `main`, `sub`) without capturing evidence in your environment.

---

## Runnable example
```http
POST /api/v2/autocomplete/accounts/ata/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filters": {
    "ata": "02"
  },
  "limit": 3
}
```

- Returns HTTP 200 with three ATA matches (`020`, `024`, `028`) sorted ascending.
- Each match includes `agency_name` and `agency_abbreviation` strings aligned with the ATA code.
