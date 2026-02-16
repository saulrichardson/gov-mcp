# Funding Agency and Office Autocomplete – Semantic Guide

## What this endpoint does
Returns autocomplete suggestions for funding agencies, sub-tier agencies, and offices that match a search term, including related hierarchy context for each match.

---

## How to call it
- **Method & path:** `POST /api/v2/autocomplete/funding_agency_office/`
- **Auth:** Not required in observed probes.
- **Body parameters:**
  - `search_text` (body, string, required) – Provide a meaningful term; the server stringifies non-string JSON values, so validate client-side to avoid surprising matches. Null or empty string fails with 400.
  - `limit` (body, integer, optional) – Applies separately to each results list. Use positive integers; zero produces empty arrays, while negative values suppress top-tier matches. Non-numeric strings yield 400, and null or object inputs trigger HTML 500.

---

## How to interpret the response
- Response body is an object with `results` and `messages`.
- `results` contains three arrays: `toptier_agency`, `subtier_agency`, and `office`. Each element includes codes, names, and cross-references, but abbreviations and office names are often null. Handle empty arrays when no matches for a category.
- `messages` has been an empty array in all observed responses; treat future values as informational warnings if they appear.

---

## Known doc mismatches
- Docs promise an array of `FundingAgencyOfficeMatchObject`, but the API returns an object keyed by `toptier_agency`, `subtier_agency`, and `office` arrays.
- Docs require non-null office names, yet live data frequently returns `name: null`.
- Docs require numeric `limit` and string `search_text`, but the API coerces other JSON types instead of rejecting them and even accepts zero or negative limits.

---

## Pitfalls & safe-usage checklist
- **Do:** Validate `search_text` as a non-empty, non-whitespace string before calling to avoid broad or meaningless matches.
- **Do:** Set a sensible positive `limit` to control payload size and keep hierarchy lists manageable.
- **Don't:** Send `limit` as null or an object; the service responds with HTML 500 instead of JSON.
- **Don't:** Assume office names or abbreviations are present; treat those fields as nullable when rendering results.

---

## Runnable examples
```http
POST /api/v2/autocomplete/funding_agency_office/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "search_text": "Defense",
  "limit": 1
}
```

- Returns top-tier, sub-tier, and office matches limited to one item each, with `messages: []`.
- Use this pattern as a smoke test; adjust `limit` upward after verifying client handling of nullable names.
