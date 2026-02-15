# Main Account Code Autocomplete – Semantic Guide

## What this endpoint does
Returns Treasury main account codes for autocomplete, filtering by Treasury Account Symbol components and limiting the number of suggested codes.

---

## How to call it
- **Method & path:** `POST /api/v2/autocomplete/accounts/main/`
- **Auth:** None required (observed).
- **Parameters:**
  - `filters` (body, object, optional) – Supports keys `ata`, `aid`, `bpoa`, `epoa`, `a`, `main`, `sub`. Provide null to target missing components or a non-empty string (trimmed before matching). `main` does prefix searches; other keys require exact matches. Unknown keys or malformed objects are ignored.
  - `limit` (body, integer, optional, default 10) – Accepts integers 0–500 inclusive. Numeric strings (even with whitespace) are coerced. Values >500 return 422, negatives trigger HTML 500 errors, and non-integers return 400.

---

## How to interpret the response
- Response is a JSON object with a `results` array of main account code strings, sorted ascending in observations.
- Empty searches return `results: []`. No pagination or total count metadata is provided.

---

## Known doc mismatches
- Docs claim `filters` is required, but the service accepts omitted or non-object filters and still returns suggestions.
- Docs describe `limit` only as an optional number; the service enforces integer-only inputs within 0–500 and fails otherwise.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Validate `limit` client-side and stay within 0–500 to avoid 422 or HTML 500 errors.
  - Double-check filter keys before sending; the service trims/ignores invalid keys without warning, so monitor for unexpectedly broad or empty result sets.
- **Don’t:**
  - Don’t assume null component filters behave uniformly; their effect beyond `a` remains unconfirmed.
  - Don’t expect metadata about ordering or totals—treat the returned array as the entire response payload.

---

## Runnable examples
```http
POST /api/v2/autocomplete/accounts/main/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filters": {
    "main": "30"
  },
  "limit": 5
}
```

- Returns a JSON object whose `results` contains codes starting with `30` (e.g., `3010`, `3011`, `3020`, ...).
