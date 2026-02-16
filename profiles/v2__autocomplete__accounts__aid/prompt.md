# Agency Identifier Autocomplete – Semantic Guide

## What this endpoint does

Returns Treasury Agency Identifier codes with agency names/abbreviations for autocomplete. Filtering is driven by TAS component fields (aid, ata, bpoa, epoa, a, main, sub), and results are sorted by `aid`.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/accounts/aid/`
- **Auth:** None observed in probes.
- **Parameters:**
  - `filters` (body, object, optional) – Provide TAS component keys with string or null values. Only object payloads influence filtering; null or non-object values are accepted but revert to the default unfiltered dataset. `aid` performs a prefix match on the three-digit identifier; empty strings raise 422, while whitespace-only strings behave as if omitted.
  - `limit` (body, integer or digit string, optional, default 10) – Accepts 0–500 inclusive. Digit strings are coerced. Decimals or null produce a 400 JSON error; negative integers throw an HTML 500.

---

## How to interpret the response

- Response body is an object with a `results` array sorted ascending by `aid`.
- Each element includes `aid` (string), `agency_name` (string or null), and `agency_abbreviation` (string or null).
- No pagination metadata is returned; adjust `limit` to control list length.

---

## Known doc mismatches

- Docs claim `filters` is required, but empty, null, or missing filters succeed and return default results.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Set `limit` high enough (≤500) when you need the full autocomplete population.
  - Send a proper object in `filters`; validate client input before calling.
- **Don’t:**
  - Assume malformed filters will fail; the API silently returns broad results instead.
  - Depend on structured JSON errors for negative limits; the service returns an HTML 500.

---

## Runnable examples

```http
POST /api/v2/autocomplete/accounts/aid/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"filters":{"aid":"02"},"limit":3}
```

- Returns the first three agencies whose AID starts with `02`, e.g., Treasury (020) and Army (021).
