# v2 Recipient – Semantic Guide

## What this endpoint does

Returns aggregated trailing 12-month federal spending totals for recipients, supporting pagination, sorting, keyword search, and high-level award-type filtering. Responses power USAspending recipient profile pages and always include pagination metadata and a recipient summary list.

This is the more reliable recipient-resolution endpoint when you need a stable `name`, `duns`, `uei`, or `id` for downstream filters such as `filters.recipient_search_text` in spending trend searches.

---

## How to call it

- **Method & path:** `POST /api/v2/recipient/`
- **Auth:** Not required in observed probes.
- **Body parameters (JSON):**
  - `limit` (integer, optional) – Page size between 1 and 1000; default 50. Numeric strings are coerced to integers. Values outside range return 422; non-integers return 400.
  - `page` (integer, optional) – 1-indexed page number; default 1. Numeric strings are coerced; values <1 return 422; non-integers return 400.
  - `sort` (string, optional) – One of `amount`, `name`, `duns`, `uei`; default `amount`.
  - `order` (string, optional) – `asc` or `desc`; default `desc`. Case-sensitive.
  - `keyword` (string, optional) – Case-insensitive search across name, UEI, or DUNS. Leading/trailing whitespace is trimmed. Empty strings return 422; `null` returns 400; whitespace-only behaves like the parameter was omitted.
  - `award_type` (string, optional) – One of `all`, `contracts`, `grants`, `loans`, `direct_payments`, `other_financial_assistance`; default `all`. Case-sensitive.

---

## How to interpret the response

- Top-level object with `page_metadata` and `results`.
- `page_metadata` always includes `page`, `total`, `limit`, `next`, `previous`, `hasNext`, and `hasPrevious`. `next`/`previous` are integers or `null` depending on navigation availability.
- `results` is an array of recipient aggregates. Each item has `id`, `duns`, `uei`, `name`, `recipient_level` (`R`/`P`/`C`), and `amount`.
- `name`, `duns`, and `uei` may be `null` or empty strings; fall back to other identifiers when needed.
- `amount` can be zero or negative. Do not assume totals are positive.
- For downstream trend analysis, observed successful `recipient_search_text` inputs included canonical recipient names from this endpoint plus returned `duns` and `uei` values.

---

## Known doc mismatches

- Live sorting accepts `uei`, even though the published docs list only `name`, `duns`, and `amount`.
- Responses always include `next`, `previous`, `hasNext`, and `hasPrevious`, exceeding the documented page metadata shape.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Keep `limit` reasonable (≤1000) and paginate rather than requesting massive pages.
  - Lowercase user-provided `award_type` and `order` values before sending to avoid 400 errors.
  - Handle missing recipient names by displaying DUNS, UEI, or `id` instead.
  - Prefer this endpoint over autocomplete when you need a recipient value to reuse in another endpoint.
- **Don’t:**
  - Don’t assume keyword input is restrictive—whitespace-only keywords effectively remove the filter.
  - Don’t rely on amounts being positive when performing aggregations or visualizations.

---

## Runnable examples

```http
POST /api/v2/recipient/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{}
```

*Returns page 1 with the top recipients by amount (limit 50, sorted `amount desc`).*

```http
POST /api/v2/recipient/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "keyword": "california",
  "award_type": "contracts",
  "limit": 3,
  "order": "asc",
  "sort": "name"
}
```

*Returns contract recipients matching “california”, sorted alphabetically with a page size of three.*
