# Object Class Count – Semantic Guide

## What this endpoint does
Counts the distinct object class records associated with a given agency toptier code for a specific fiscal year. When `fiscal_year` is omitted or empty, it defaults to the most recent year loaded by USAspending (FY2026 at capture time).

---

## How to call it
- **Method & path:** `GET /api/v2/agency/{toptier_code}/object_class/count/`
- **Auth:** None required in observed probes.
- **Parameters:**
  - `toptier_code` (path, string, required) – Provide a 3- or 4-digit numeric CGAC/FREC code. Unknown numeric codes return JSON 404; non-numeric or wrong-length segments fall through routing and yield HTML 404.
  - `fiscal_year` (query, integer, optional) – Accepts integers 2008–2026 inclusive. Omit or send an empty string to default to the current FY. Non-integer inputs (including a single space) trigger 400; integers outside the range trigger 422 with min/max detail.

---

## How to interpret the response
- Returns a JSON object.
- `toptier_code` and `fiscal_year` echo the validated inputs/defaults.
- `object_class_count` is a non-negative integer representing the number of distinct object classes for that agency/year.
- `messages` is an array of warning strings; it is empty in normal cases and includes the DATA Act availability notice for fiscal years before 2017.

---

## Known doc mismatches
- Docs imply JSON error payloads, but malformed `toptier_code` path segments return an HTML 404 page.

---

## Pitfalls & safe-usage checklist
- **Do:** Validate `toptier_code` locally to be numeric and 3–4 digits before calling to avoid HTML responses.
- **Do:** Inspect the `detail` field on 400/422 errors to understand validation issues.
- **Do:** Check `messages` for DATA Act warnings when requesting fiscal years before 2017.
- **Don't:** Send whitespace (e.g., a single space) for `fiscal_year`; it fails validation instead of defaulting.

---

## Runnable examples
```http
GET /api/v2/agency/012/object_class/count/ HTTP/1.1
Host: api.usaspending.gov
```
- Returns 200 with `{ "toptier_code": "012", "fiscal_year": 2026, "object_class_count": 56, "messages": [] }`.

```http
GET /api/v2/agency/9553/object_class/count/?fiscal_year=2016 HTTP/1.1
Host: api.usaspending.gov
```
- Returns 200 with `{ "object_class_count": 0 }` plus a DATA Act warning in `messages` because FY2016 predates the reporting start.
