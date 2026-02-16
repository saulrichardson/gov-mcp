# CFDA Autocomplete – Semantic Guide

## What this endpoint does

Returns CFDA program suggestions that match a provided search string. Results include program numbers, titles, and popular names, limited by an optional cap.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/cfda/`
- **Auth:** None required in observed probes.
- **Parameters:**
  - `search_text` (body, string, required) – Provide a non-empty string to match against program numbers, titles, and popular names. Whitespace is preserved, so include only the characters you intend to search; numeric inputs raise HTML 500 errors, and arrays are treated as missing (400).
  - `limit` (body, integer, optional) – Caps the number of results (default 10). Accepts values that coerce to integers (numeric strings, decimals, booleans). Use 0 to request an empty list. Negative numbers, null, or array values trigger HTML 500 errors; non-numeric strings (including "") return a 400 with detail `Limit request parameter is not a valid, positive integer`.

---

## How to interpret the response

- Response is a JSON object with a `results` array.
- Items are ordered lexicographically by `program_number` and include string fields `program_number`, `program_title`, and `popular_name` (which may be empty or oddly spaced).
- An empty array indicates no matches.

---

## Known doc mismatches

- Docs describe `limit` as a simple number, but negative, null, or array limits produce HTML 500 errors instead of typed validation feedback.
- Docs imply schema validation for `search_text`, yet numeric inputs yield HTML 500 server errors rather than structured messages.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate `limit` client-side to avoid unparseable HTML 500 responses.
  - Trim or normalize `search_text` before sending if whitespace sensitivity is undesirable.
- **Don’t:**
  - Don’t request extremely large limits unless you can handle the full ~3.8k-record payload.
  - Don’t assume `popular_name` is populated; handle blanks or irregular spacing when displaying results.

---

## Runnable examples

```http
POST /api/v2/autocomplete/cfda/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "search_text": "education",
  "limit": 5
}
```

- Returns up to five matches such as program `12.550` “The Language Flagship Grants to Institutions of Higher Education”.
- Adjust `limit` to 0 to request an empty array without errors.
