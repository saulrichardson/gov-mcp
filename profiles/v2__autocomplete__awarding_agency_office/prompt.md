# Awarding Agency & Office Autocomplete – Semantic Guide

## What this endpoint does
Autocomplete awarding agency, sub-agency, and office names or abbreviations and return hierarchy context grouped by tier. Each successful call yields parallel arrays for toptier agencies, subtier agencies, and offices that include cross-links to their related nodes.

---

## How to call it
- **Method & path:** `POST /api/v2/autocomplete/awarding_agency_office/`
- **Auth:** None required in observed probes.
- **Body parameters:**
  - `search_text` (`string`, required) – Literal match input. Missing, `null`, or empty strings return 400. Comparison is case-insensitive but does not trim whitespace, so pad-free text is critical.
  - `limit` (`integer`, optional) – Per-category cap. Defaults to 10. Numeric strings and floats are coerced; `0` returns empty arrays; negatives distort the payload; `null` crashes the endpoint with a 500 HTML response; alphabetic strings raise a 400 validation error. Clamp inputs to positive integers client-side.
- **Other:** Unknown body fields are ignored.

---

## How to interpret the response
- Root object containing `results` and `messages`.
- `results` is an object with three arrays: `toptier_agency`, `subtier_agency`, and `office`. Each entry embeds identifying codes, names, and references to related tiers. Nested office records can surface `code` or `name` as `null`.
- `messages` is an array of informational strings; all observed responses returned it empty, so do not rely on it for truncation warnings.

---

## Known doc mismatches
- Docs promise a single array of `AwardingAgencyOfficeMatchObject`, but the live API returns three separate arrays grouped by tier.
- Docs claim office `code` and `name` are always strings; probes showed `null` values in live data.
- Docs treat `limit` strictly numeric, yet the service coerces numeric strings/floats, mishandles negatives, and throws a 500 on `null`.

---

## Pitfalls & safe-usage checklist
- **Do:** Trim `search_text` and validate it is non-empty before calling.
- **Do:** Enforce `limit` as a positive integer to avoid distorted payloads or 500 errors.
- **Do:** Build consumers that tolerate `null` office identifiers and handle empty arrays per tier.
- **Don’t:** Assume `messages` will warn about truncation—check array lengths directly.
- **Don’t:** Rely on the published docs’ combined results schema; expect three keyed arrays instead.

---

## Runnable example
```http
POST /api/v2/autocomplete/awarding_agency_office/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"search_text":"Defense","limit":1}
```

Returns 200 with `results.toptier_agency[0].name = "Defense Nuclear Facilities Safety Board" and parallel entries in the other arrays; `messages` is `[]`.
