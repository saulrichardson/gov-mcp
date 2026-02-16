# CFDA Loans (Disaster) – Semantic Guide

## What this endpoint does
Returns CFDA-level aggregates for disaster and emergency loan awards, including totals and CFDA metadata, filtered by required DEFC code selections with optional keyword and loan-type constraints.

---

## How to call it
- **Method & path:** `POST /api/v2/disaster/cfda/loans/`
- **Auth:** Not observed in probes (public endpoint).
- **Body parameters (JSON):**
  - `filter.def_codes` (**required**, array[string]) – uppercase DEFC codes (`['1','2','3','4','5','6','7','8','9','A','AAA','AAB','AAC','AAD','AAE','AAF','AAG','AAH','AAI','AAJ','AAK','AAL','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','QQQ','R','S','T','U','V','W','X','Y','Z']`). Rejects empty arrays, lowercase entries, or unknown codes (400/422).
  - `filter.award_type_codes` (optional, array[string]) – restrict to `"07"` and/or `"08"`. Empty arrays 422; other values 400. Omit to leave loan types unrestricted.
  - `filter.query` (optional, string|null) – case-insensitive keyword match. `null` and whitespace-only strings behave as absent; empty string 422; non-string 400.
  - `pagination.page` (optional, integer) – minimum 1; numeric strings OK; 0/negatives 422; decimals 400.
  - `pagination.limit` (optional, integer) – minimum 1, maximum 100; numeric strings OK; 0 or >100 trigger 422 with explicit message.
  - `pagination.sort` (optional, string) – one of `award_count`, `description`, `code`, `id`, `obligation`, `outlay`, `face_value_of_loan`. Requests for `id` or `code` fall back to `description` and add a warning.
  - `pagination.order` (optional, string) – `asc` or `desc`; other values 400.
  - `spending_type` (optional, string|null) – accepts any value; ignored in responses.

---

## How to interpret the response
- Top-level object with:
  - `totals` – numeric aggregates (`award_count`, `face_value_of_loan`, `obligation`, `outlay`).
  - `results` – array of CFDA program records containing identifiers, financial totals, agency metadata, and eligibility narratives. `resource_link` may be null; numeric fields arrive as numbers.
  - `page_metadata` – pagination echo (`page`, `total`, `limit`, `next`, `previous`, `hasNext`, `hasPrevious`).
  - `messages` – optional array of warning strings, observed when unsupported sorts fall back to `description`.

---

## Known doc mismatches
- Docs claim `result.id` is a string, but the API returns integers.
- Docs advertise `id` and `code` sorts; the API accepts them but actually sorts by `description` and emits warnings.
- Docs omit the `messages` warning array that appears in API responses.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Trim keyword input before sending so you know whether a filter was actually applied.
  - Inspect `messages` on every response; a present warning means your requested sort was not honored.
  - Set `limit` explicitly (≤100) and paginate with `hasNext`/`next` to avoid empty last pages.
- **Don't:**
  - Don’t submit lowercase DEFC codes or unsupported award types; the API rejects them.
  - Don’t rely on server-side ordering for `id` or `code`; sort client-side if that order matters.
  - Don’t assume textual fields like `cfda_website` will be null-safe without checking; null behavior is undocumented.

---

## Runnable examples
```http
POST /api/v2/disaster/cfda/loans/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filter": {
    "def_codes": ["L"]
  },
  "pagination": {
    "limit": 2,
    "sort": "description",
    "order": "asc"
  }
}
```

- Returns a paginated list of CFDA programs with aggregated loan metrics for DEFC `L`.
- `messages` is omitted because `description` sorting is natively supported.
- Use `page_metadata.next` to request additional pages until `hasNext` is false.
