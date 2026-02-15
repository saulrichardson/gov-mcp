# Glossary – Semantic Guide

## What this endpoint does

Returns USAspending glossary entries (terms + definitions/resources) used to power glossary components. It supports simple pagination via `page` and `limit`.

---

## How to call it

- **Method & path:** `GET /api/v2/references/glossary/`
- **Auth:** None observed (probes succeeded without auth headers).
- **Parameters:**
  - `page` (query, integer, optional) – 1-based page number. Defaults to `1` when omitted. Values `< 1` return `422` with JSON `{ "detail": "..." }`; non-integers (e.g., `1.5` or `""`) return `400` with JSON `{ "detail": "..." }`. Pages beyond the available range return `200` with `results: []`.
  - `limit` (query, integer, optional) – maximum entries per page, `1..500` inclusive. Out-of-range values return `422`; non-integers (e.g., `1.0` or `""`) return `400`. When omitted, the API currently returns all entries on page 1 (`page_metadata.count=149` at last verification), so set `limit` explicitly to control payload size.
- **URL shape:** Use the trailing slash. `GET /api/v2/references/glossary` returns `301` with an empty `text/html` body.

---

## How to interpret the response

- Top-level response is a JSON object with:
  - `page_metadata` (object) – pagination info: `page`, `count`, `next`, `previous`, `hasNext`, `hasPrevious`.
  - `results` (array) – glossary entries for the requested page (may be empty).
- Each glossary entry includes:
  - `term` (string) and `slug` (string)
  - `plain` (string) – may contain newlines/Markdown
  - `data_act_term` (string|null)
  - `official` (string|null)
  - `resources` (string|null) – may contain Markdown links

---

## Known doc mismatches

- Docs say `data_act_term` is a required string; probes show it can be `null`.
- Docs say `official` is a required string; probes show it can be `null`.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Always set `limit` explicitly and paginate instead of relying on the omit-limit behavior.
  - Treat `data_act_term`, `official`, and `resources` as nullable.
  - Stop pagination on `page_metadata.hasNext=false` and/or when `results` is empty.
- **Don’t:**
  - Don’t rely on `page_metadata.previous/hasPrevious` when you accidentally request pages far beyond the end; requesting `page > last_page+1` resets them to `null/false` even though earlier pages exist.
  - Don’t rely on result ordering being stable; it’s undocumented.
  - Don’t expect typos in query params to error; unknown query parameters are ignored.

---

## Runnable examples

```http
GET /api/v2/references/glossary/?limit=2&page=1 HTTP/1.1
Host: api.usaspending.gov
```

```http
GET /api/v2/references/glossary/?limit=0&page=1 HTTP/1.1
Host: api.usaspending.gov
```
