# Beginning Period of Availability Autocomplete – Semantic Guide

## What this endpoint does

Returns autocomplete suggestions for Treasury Beginning Period of Availability (BPOA) values used by USAspending Advanced Search filters. Suggestions come from treasury accounts that match the provided component filters.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/accounts/bpoa/`
- **Auth:** Not required in observed probes.
- **Body parameters:**
  - `filters` (object, optional) – Accepts treasury component keys `ata`, `aid`, `bpoa`, `epoa`, `a`, `main`, `sub`. Strings match stored values; `bpoa` supports prefix matching. Use `null` to target accounts missing a component. Non-object payloads are accepted but treated as unfiltered, and an empty string `bpoa` is rejected with 422.
  - `limit` (integer, optional) – Defaults to 10. Allowable range is 0–500 inclusive; digit strings are coerced. Decimals and booleans return 400, values above 500 return 422, and negative integers (including `"-5"`) trigger a 500 error.

---

## How to interpret the response

- Response is an object containing `results`, an array of four-digit year strings or `null` when the account has no BPOA.
- Values are sorted ascending and capped by `limit`; `null` appears last when present.

---

## Known doc mismatches

- Docs require the `filters` component, but the live API accepts requests without it and still returns suggestions.
- Docs describe `limit` as a generic number without noting the enforced integer type and 0–500 bounds.
- Docs imply `filters` must be an object, yet the API accepts strings, arrays, or `null` without error.

---

## Pitfalls & safe-usage checklist

- **Do:** Sanitize `limit` to an integer between 0 and 500 before sending.
- **Do:** Validate filter objects client-side so typos or wrong types do not silently broaden the search.
- **Do:** Use `filters.bpoa` prefixes or `null` components to refine suggestions deliberately.
- **Don’t:** Send empty strings for `bpoa` or negative limits; they return 422 or 500 errors.
- **Don’t:** Rely on the server to reject malformed filter payloads—it will often accept them as unfiltered searches.

---

## Runnable examples

```http
POST /api/v2/autocomplete/accounts/bpoa/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filters": {
    "bpoa": "201"
  }
}
```

- Returns matching BPOA year strings such as `2010`–`2019` with the default limit of 10.
- Add `"limit": 3` to receive only the first three matches, or set component keys like `"epoa": null` to surface `null` BPOA entries.
