# Recipient Autocomplete – Semantic Guide

## What this endpoint does

POST `/api/v2/autocomplete/recipient/` returns recipient matches that power the Advanced Search autocomplete, searching names, UEIs, and DUNS and bundling them into one result list with a shared deprecation warning about `recipient_level`.

---

## How to call it

- **Method & path:** `POST /api/v2/autocomplete/recipient/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `search_text` (body, string, required) – minimum length 1; empty string yields 422, whitespace-only returns zero matches; null or non-strings give 400; very long strings (~260+ chars) triggered 503.
  - `limit` (body, integer, optional, default 10) – accepts 1–500; numeric strings are coerced; >500 returns 422; non-integers (including booleans) return 400; 0 or negatives triggered 503. Applied per match bucket (names, UEIs, DUNS), so totals may be up to ~3× the input.
  - `recipient_levels` (body, array[string], optional) – must be a non-empty array of uppercase codes; empty array yields 422, null/invalid types yield 400; unknown codes silently drop from results.

---

## How to interpret the response

- Response is an object with `count`, `results`, and `messages`.
- `count` always equals the length of `results`.
- `results` entries carry `recipient_name` (string), `recipient_level` (currently always null), `uei` (string|null), and `duns` (string|null; may include punctuation).
- `messages` consistently contains the deprecation warning about `recipient_level`; no other status flags were observed.

---

## Known doc mismatches

- Response always includes undocumented top-level `count`.
- Docs require `recipient_level` in each result, but live data returns null plus a deprecation warning.
- `limit` is enforced per match type (names, UEIs, DUNS), not as a single total.
- Numeric string values for `limit` are accepted even though docs imply strict numeric typing.

---

## Pitfalls & safe-usage checklist

- **Do:** set `limit` conservatively for broad queries to avoid unexpectedly large payloads.
- **Do:** handle 503s for invalid `limit` values or oversized `search_text` as retryable/validation failures.
- **Do:** treat `recipient_level` as deprecated until the API reintroduces real values.
- **Don’t:** assume DUNS values are strictly numeric; they may include symbols.
- **Don’t:** rely on undocumented validation for `recipient_levels`; invalid codes simply vanish from results.

---

## Runnable examples

```http
POST /api/v2/autocomplete/recipient/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "search_text": "a",
  "limit": 1
}
```

- Returns three entries: one name-only, one UEI match, and one DUNS match (e.g., DUNS `&90379A9N`), illustrating per-bucket limiting and the constant deprecation message.
