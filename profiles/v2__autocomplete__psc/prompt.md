# PSC Autocomplete - Semantic Guide

## What this endpoint does

Returns Product or Service Codes (PSC) and descriptions that match the provided autocomplete search text. Useful for powering Advanced Search inputs that need PSC lookups.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/psc/`
- **Host:** `https://api.usaspending.gov`
- **Auth:** Not required in observed probes.
- **Headers:** Send `Content-Type: application/json` or the body may be rejected as missing `search_text`.
- **Body parameters:**
  - `search_text` (body, string, required) - Provide the search term as a JSON string. Empty strings are rejected (400). Whitespace-only strings succeed but return `results: []`. Arrays succeed but return empty results. Numeric or boolean values trigger a 500 HTML error.
  - `limit` (body, integer, optional, default 10) - Controls the maximum number of suggestions. Floats truncate toward zero (for example, 2.5 -> 2, 0.7 -> 0). Boolean values coerce to 1 or 0. Zero is allowed and yields an empty array. Null or negative values produce a 500 HTML error. Non-numeric strings (including decimal strings) return a 400 validation error. Large limits simply return the full 3,627-row catalog (about 370 KB).

---

## How to interpret the response

- Response is always a JSON object with a `results` array.
- Each entry has `product_or_service_code` (string) and `psc_description` (string).
- The array length never exceeds the smaller of your `limit` and the 3,627-row PSC catalog. Empty arrays are valid (no matches or `limit: 0`).
- Errors can be JSON (400) or HTML (500); handle both content types.

---

## Known doc mismatches

- Docs call `limit` a number, but the backend insists on a positive integer; decimal strings and other non-integers fail with a 400 validation error.
- Docs imply validation for invalid `limit` inputs, yet negative or null values crash with a 500 HTML response instead of JSON feedback.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate `search_text` and `limit` types client-side to avoid unexpected 500 HTML errors.
  - Cap `limit` to a reasonable value to avoid pulling the entire catalog in one response.
  - Set the `Content-Type: application/json` header on every request.
- **Don't:**
  - Don't rely on partial PSC code prefixes; submit the full four-character code for code lookups.
  - Don't assume the result ordering is stable or documented.
  - Don't ignore the possibility of HTML error payloads when parsing responses.

---

## Runnable example

```http
POST /api/v2/autocomplete/psc/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"search_text": "defense", "limit": 3}
```

- Returns three PSC entries such as `AC`, `AC11`, and `AC12` with their descriptions.
- Increase `limit` (positive integer) to fetch more suggestions, or omit it for the default 10.
- A malformed `limit` (for example, "foo" or `-1`) demonstrates the documented 400 error and the observed 500 crash, respectively.
