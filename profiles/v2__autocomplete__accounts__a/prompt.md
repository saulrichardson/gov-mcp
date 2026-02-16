# Availability Type Code Autocomplete – Semantic Guide

## What this endpoint does

Returns Availability Type Code (column “A”) options for Treasury Accounts used by the Advanced Search autocomplete. Supports filtering by TAS components and limiting the number of returned codes.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/accounts/a/`
- **Auth:** None required in observed probes.
- **Parameters:**
  - `filters` (body, object, optional) – Treasury account component filters (`ata`, `aid`, `bpoa`, `epoa`, `a`, `main`, `sub`). Provide non-empty strings or `null`; empty strings raise 422 and non-string types raise 400. Missing, null, or non-object inputs are treated as no filters.
  - `limit` (body, integer, optional, default 10) – Controls result size, accepts integers 0–500 inclusive. Numeric strings within range are coerced. Values above 500 return 422; negatives trigger a 500 HTML error; floats/booleans/null are rejected with 400.

---

## How to interpret the response

- Response is an object containing `results`.
- `results` is an array of availability codes; observed values are the string `"X"` and JSON `null`. When both appear, `"X"` precedes `null`.
- Expect an empty array when no matches or when `limit` is 0.

---

## Known doc mismatches

- Docs mark `filters` as required, but the live API accepts missing, null, or non-object filters without error.
- Docs describe `limit` as a generic number, yet the API enforces an integer-only range of 0–500.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate `limit` before calling to stay within 0–500 and avoid HTML 500 errors.
  - Supply explicit, correctly cased filter keys; unexpected keys are ignored silently.
- **Don’t:**
  - Don’t send empty strings for component filters; they return 422 validation errors.
  - Don’t assume error payloads are always JSON—handle possible HTML responses for server errors.

---

## Runnable examples

```http
POST /api/v2/autocomplete/accounts/a/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filters": {"bpoa": "2016"},
  "limit": 2
}
```

- Returns `{ "results": [null] }`, showing finite-period TAS resolving to `null` availability type.

```http
POST /api/v2/autocomplete/accounts/a/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filters": {"a": ""}
}
```

- Returns a 422 JSON error: `Field 'filters|a' value '' is below min '1' items`.
