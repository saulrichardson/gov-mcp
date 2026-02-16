# Advanced Search City Autocomplete - Semantic Guide

## What this endpoint does

Returns autocomplete suggestions for city names drawn from recipient or primary place-of-performance data. Results respect the provided country and optional state filter, and the response reports both the limited result set and the total matching count.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/city/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `search_text` (body, string, required) - Prefix text used to match city names. Must be a non-empty string. Whitespace-only values are accepted but return very broad matches; null is rejected.
  - `limit` (body, integer, optional) - Defaults to 10 when omitted. Accepts integers 0-500 inclusive or numeric strings that parse cleanly; negative integers shrink the result set and counts, and values near or below -100 return 503. Floats, null, or non-numeric strings are rejected with 400.
  - `filter` (body, object, required) - Defines search scope. Missing or empty objects yield 422.
    - `country_code` (string, required) - Case-insensitive country code. Unknown codes return zero matches; null triggers 400.
    - `scope` (string, required) - Must be `recipient_location` or `primary_place_of_performance` exactly; other casing or values return 400.
    - `state_code` (string, optional) - Further narrows domestic or foreign results. Null acts as omission; empty string returns 422; unrecognized strings simply produce zero matches.

---

## How to interpret the response

- Response is an object with `count` (integer) and `results` (array).
- `count` reports the total matches the backend found; negative limits can reduce this number due to internal offset handling.
- Each entry in `results` includes `city_name` and `state_code`, both observed as uppercase strings. No null `state_code` values have appeared, though documentation claims they may occur.
- Payload size is capped by `limit`; there is no pagination token to fetch additional rows once the cap is reached.

---

## Known doc mismatches

- Docs mark `filter` optional, but the API requires both `filter.country_code` and `filter.scope`.
- Docs require `limit`, yet the API defaults to 10 when it is omitted.
- Docs describe `limit` as a generic number, while the API only accepts integers (with string coercion) and enforces a 500 maximum.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Clamp `limit` within 0-500 and avoid negative values to prevent truncated data or 503 errors.
  - Trim or validate `search_text` so users do not issue whitespace-only queries that return overwhelming result sets.
  - Handle 503 responses that arrive without a body.
- **Don't:**
  - Don't rely on pagination; if `count` exceeds your `limit`, additional rows cannot be fetched via this endpoint.
  - Don't vary the casing of `filter.scope`; mixed-case values are rejected.

---

## Runnable example

```http
POST /api/v2/autocomplete/city/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "search_text": "Springfield",
  "limit": 40,
  "filter": {
    "country_code": "USA",
    "scope": "recipient_location",
    "state_code": "VA"
  }
}
```

- Returns a single Springfield, VA match with `count: 1`.
