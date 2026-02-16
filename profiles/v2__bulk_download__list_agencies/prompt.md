# List Agencies – Semantic Guide

## What this endpoint does
Returns the agency picklists that power bulk downloads. Without an agency id it delivers aggregated CFO/other toptier agency groups; with a valid toptier id it swaps to the corresponding subtier agency names.

---

## How to call it
- **Method & path:** `POST /api/v2/bulk_download/list_agencies/`
- **Auth:** Not required in observed probes.
- **Content:** Send JSON (`application/json`) or form-encoded (`application/x-www-form-urlencoded`).
- **Parameters:**
  - `type` (body, string, required) – Case-sensitive selector; must be `account_agencies` or `award_agencies`. Any other value, including uppercase or null, returns a 400 with `detail`.
  - `agency` (body, number|string|null, optional) – Valid toptier id to fetch subtier agencies. JSON numbers are truncated to integers and 0 behaves like omission. Accept digit-only strings (e.g., `"63"`). Strings such as `"63.0"`, whitespace, or non-digits cause HTML 500s; the string `"0"` returns `detail: "Agency ID not found"`. Null or `""` act like omission.

---

## How to interpret the response
- Root object always contains `agencies` and `sub_agencies`.
- `agencies` is an object with `cfo_agencies` / `other_agencies` arrays when no agency filter is used, but becomes the literal `[]` when subtier results (or an id without flagged sub-agencies) are returned.
- Items in the aggregated lists expose `name`, `toptier_agency_id`, and `toptier_code`.
- `sub_agencies` is an array of objects with `subtier_agency_name`; it is empty for aggregated calls.

---

## Known doc mismatches
- Docs promise `agencies` is always an object, but runtime responses return `[]` for subtier lookups or toptiers without flagged sub agencies.
- Docs suggest `agency: 0` yields sub agencies, yet the live API treats numeric 0 as omission (only the string `"0"` errors).

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Force IPv4 and implement retries; IPv6 attempts often close with empty replies.
  - Validate `agency` strings client-side to reject decimals or whitespace before calling the API.
  - Handle both the object and empty-array shapes for `agencies`.
- **Don’t:**
  - Don’t assume uppercase `TYPE` variants work; the field is strictly case-sensitive.
  - Don’t send unchecked user strings for `agency`; malformed values raise HTML 500s.

---

## Runnable examples
```http
POST /api/v2/bulk_download/list_agencies/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "type": "account_agencies"
}
```

Returns the aggregated toptier agency lists (`cfo_agencies` / `other_agencies`) with `sub_agencies: []`.

```http
POST /api/v2/bulk_download/list_agencies/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "type": "award_agencies",
  "agency": 63
}
```

Returns `agencies: []` and a `sub_agencies` array containing Homeland Security subtiers.
