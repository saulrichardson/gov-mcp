# Program Activity Autocomplete - Semantic Guide

## What this endpoint does

Finds program activity codes and names that match a partial code or text fragment. Returns relevance-ordered code/name pairs for use in autocomplete UI flows.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/program_activity/`
- **Auth:** Not required in observed probes.
- **Body parameters (JSON object):**
  - `search_text` (body, string, required) - Case-insensitive substring matched against codes and names. Must be a non-empty string; missing, null, or empty string values return HTTP 400.
  - `limit` (body, integer, optional) - Maximum matches to return. Defaults to 10. Accepts integers >=0, JSON numbers with decimals (truncated toward zero), booleans (true becomes 1, false becomes 0), and numeric strings. Zero yields an empty list, non-numeric strings return 400, and negative or null inputs trigger an HTML 500.
- Additional JSON fields are ignored by the backend.

---

## How to interpret the response

- Top-level JSON object with a `results` array.
- Each element has `program_activity_code` and `program_activity_name`, both non-null strings.
- Ordering reflects backend relevance. Duplicate codes can appear with different names; deduplicate if you need unique codes.

---

## Known doc mismatches

- Docs say `limit` is a generic number, but the API only accepts integer-like values; decimal or negative strings fail validation.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Validate `search_text` client-side to ensure a non-empty string before calling.
  - Set a sensible `limit` to avoid large payloads; tested values up to 20,000 returned thousands of rows.
  - Handle HTML 500 responses from invalid input types by retrying only after fixing the payload.
- **Don't:**
  - Don't rely on a documented maximum `limit`; none was observed.
  - Don't assume response ordering is stable; treat it as best-effort relevance.

---

## Runnable examples

```http
POST /api/v2/autocomplete/program_activity/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"search_text":"Meat","limit":5}
```

- Returns the top five matches for "Meat".
- Response includes code/name pairs such as `0003` "MEAT GRADING".
```
