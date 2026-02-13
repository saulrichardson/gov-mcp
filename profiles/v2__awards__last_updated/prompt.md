# Awards Last Updated – Semantic Guide

## What this endpoint does
Returns the most recent awards dataset refresh date as a single MM/DD/YYYY string. Only GET returns the payload; other verbs (e.g., POST) are rejected with 405.

---

## How to call it
- **Method & path:** `GET /api/v2/awards/last_updated/` (trailing slash optional)
- **Auth:** None observed in successful probes.
- **Parameters:**
  - *(none)* – the route ignores unexpected query keys, so omit them unless you are intentionally testing behavior.

---

## How to interpret the response
- Response is a single-object JSON payload.
- Field `last_updated` (string, required) holds the latest refresh date in MM/DD/YYYY format. Treat it as an opaque display string—no timezone or timestamp accompanies it.

---

## Known doc mismatches
- None observed.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Treat `last_updated` as display text and parse carefully if you must compare dates.
  - Consider bypassing caches if you require the absolute latest refresh value; responses frequently come from cache (Cache-Trace: hit-cache).
- **Don’t:**
  - Don’t assume the string is ISO-8601 or includes timezone context.
  - Don’t rely on the undocumented empty-string sentinel unless you’ve verified it in your environment.

---

## Runnable examples
```http
GET /api/v2/awards/last_updated/ HTTP/1.1
Host: api.usaspending.gov
```
- Returns `{"last_updated":"02/06/2026"}` with HTTP 200.
