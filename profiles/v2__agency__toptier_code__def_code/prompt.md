# v2/agency/toptier_code/def_code – Semantic Guide

## What this endpoint does

Documented to return agency-level Disaster Emergency Fund (DEF) totals, but every live probe currently receives an HTML 404 Not Found response, so no DEF data is delivered.

---

## How to call it

- **Method & path:** `GET /api/v2/agency/{toptier_code}/def_code/`
- **Auth:** None observed (requests succeeded or failed without credentials).
- **Parameters:**
  - `toptier_code` (path, string, required) – agency identifier placed in the path; values such as `086`, `097`, and `000` all produce the same 404.

---

## How to interpret the response

- Current behavior returns an HTML `Not Found` page (`text/html; charset=utf-8`) with no JSON payload.
- No pagination, totals, or DEF code listings are available until the provider restores the documented contract.

---

## Known doc mismatches

- Documentation promises DEF totals in JSON for this route, but the live service responds with HTML 404 for all tested inputs.

---

## Pitfalls & safe-usage checklist

- **Do:** Detect the 404 condition early and fall back to alternate data sources (e.g., `/api/v2/agency/{toptier_code}/` or `/api/v2/references/def_codes/`).
- **Do:** Log the unexpected HTML body so upstream teams can escalate the missing route.
- **Don’t:** Assume documented query parameters (`fiscal_year`, `filter`, `order`, `sort`, `page`, `limit`) work—they were untestable because the route never returned JSON.
- **Don’t:** Parse the HTML body for data; it only contains a generic error message.

---

## Runnable examples

```http
GET /api/v2/agency/086/def_code/ HTTP/1.1
Host: api.usaspending.gov
```

- Responds `404 Not Found` with an HTML body instead of DEF totals.
