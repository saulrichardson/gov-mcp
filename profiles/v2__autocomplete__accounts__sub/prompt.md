# Sub Account Code Autocomplete – Semantic Guide

## What this endpoint does

Returns Treasury Sub Account code suggestions for TAS components. Works even when filters are omitted by serving a default set of codes, and trims valid filters to narrow the list.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/accounts/sub/`
- **Auth:** Not required in observed probes.
- **Body parameters:**
  - `filters` (body, object, optional) – Supports keys `ata`, `aid`, `bpoa`, `epoa`, `a`, `main`, `sub`. Provide strings (trimmed server-side) or `null` to match missing components. Blank strings raise 422. Malformed lengths simply yield no matches.
  - `limit` (body, integer or numeric string, optional, default 10) – Accepts 0–500 inclusive. Strings with surrounding whitespace are accepted; values >500 return 422; negative numbers (even as strings) return an HTML 500; non-integer strings, floats, null, or booleans return 400.

---

## How to interpret the response

- Response is an object containing `results`.
- `results` is a sorted array of string sub account codes (leading zeros preserved). Empty array means no matches or limit 0. Maximum observed length is 500 entries.

---

## Known doc mismatches

- Filters are documented as required, but the API accepts omitted, null, array, or scalar filters and returns default suggestions.
- Documentation omits the enforced `limit` ceiling of 500, acceptance of whitespace-wrapped numeric strings, and the 500 error thrown for negative numbers.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate `limit` stays between 0 and 500 before sending requests.
  - Trim and validate component strings on the client to avoid silent empty results.
  - Combine multiple component filters when you need precise matches.
- **Don't:**
  - Don’t rely on the API to reject malformed component codes; it will return empty results instead.
  - Don’t send negative limits expecting JSON errors—the service responds with HTML 500 pages.

---

## Runnable examples

```http
POST /api/v2/autocomplete/accounts/sub/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filters": {
    "aid": "097",
    "bpoa": "2016",
    "epoa": "2016"
  },
  "limit": "5"
}
```

- Returns the matching sub account codes sorted ascending; with these filters the response body includes `{"results":["000"]}`.
