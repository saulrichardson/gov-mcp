# Ending Period of Availability Autocomplete – Semantic Guide

## What this endpoint does

Autocomplete endpoint for Treasury Account Ending Period of Availability values used by Advanced Search filters. Returns the most relevant EPOA strings for the supplied Treasury Account component filters, falling back to common values when no filters are provided.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/accounts/epoa/`
- **Auth:** None required in observed probes.
- **Parameters:**
  - `filters` (body, object, optional) – Treasury Account components (`ata`, `aid`, `bpoa`, `epoa`, `a`, `main`, `sub`). Each value must be text or null; prefix matching applies to `epoa`, while other fields expect exact matches. Missing, null, or malformed filters are treated as empty and return broad defaults.
  - `limit` (body, integer, optional, default 10) – Number of values to return, must be between 0 and 500 inclusive. Only integer inputs (or digit-only strings) are accepted; decimals, booleans, null, or values above 500 raise 400/422 errors, and negative integers provoke a 500 HTML error.

---

## How to interpret the response

- Returns a JSON object containing `results`, an array of EPOA strings with optional `null` entries for accounts lacking an ending period.
- Observed responses were ascending and never exceeded the requested `limit`.
- No pagination metadata was observed; expect all hits within the provided `limit`.

---

## Known doc mismatches

- Docs mark `filters` as required, but the service accepts missing, null, or non-object filters and still returns data.
- Docs do not mention the enforced `limit` maximum of 500.
- Docs describe `limit` as a generic number, yet the service only accepts integers (digit-only strings are coerced) and rejects floats.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate `limit` locally to stay within 0–500 before calling.
  - Provide explicit filters to avoid accidentally relying on broad default results.
  - Handle `null` entries in `results` to accommodate accounts without an ending period.
- **Don’t:**
  - Don’t assume typos in filter keys will fail; unknown keys are silently ignored.
  - Don’t depend on negative limits to raise clear errors—the service responds with a 500 HTML page.

---

## Runnable examples

```http
POST /api/v2/autocomplete/accounts/epoa/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filters": {
    "epoa": "201"
  },
  "limit": 5
}
```

- Returns the first five EPOA strings starting with `201` (e.g., `"2010"` through `"2014"`).
