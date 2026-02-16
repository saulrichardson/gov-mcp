# v2/disaster/agency/count – Semantic Guide

## What this endpoint does

Documentation states this POST endpoint should return the count of toptier agencies tied to disaster or emergency funding for the supplied DEF codes, optionally narrowed by award type codes. Live probes against the API host never produced a response, so this behavior is unverified.

---

## How to call it

- **Method & path:** `POST /api/v2/disaster/agency/count/`
- **Auth:** Undetermined; every unauthenticated probe was rejected before an HTTP response.
- **Parameters:**
  - `filter` (body, object, undocumented requirement) – Docs say include disaster funding filters here; runtime enforcement unknown.
  - `filter.def_codes` (body, array[string], doc-claimed required) – Supposedly the DEF codes to include, e.g., `"L"`; requirement unconfirmed.
  - `filter.award_type_codes` (body, array[string], doc-claimed optional) – Documentation lists award type codes that should limit the count; values never verified.

---

## How to interpret the response

- Expected top-level shape is an object with a numeric `count` field according to documentation.
- No successful responses were captured; treat the documented schema as unverified and instrument clients to handle empty or malformed replies.

---

## Known doc mismatches

- API documentation promises JSON, but every probe to `https://api.usaspending.gov/api/v2/disaster/agency/count/` ended in an empty TLS close with no HTTP response.
- Alternative clients and headers did not change the behavior; the host never returned the documented payload.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Implement retry and circuit-breaker logic that treats connection closes as hard failures.
  - Plan for additional network requirements (allowlists, mTLS, auth headers) before depending on this endpoint.
- **Don’t:**
  - Don’t assume documentation-described fields are enforced; validate responses defensively.
  - Don’t rely on `www.usaspending.gov` as a fallback—the same path serves only cached HTML there.

---

## Runnable examples

```http
POST /api/v2/disaster/agency/count/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"filter":{"def_codes":["L"]}}
```

* Observed result: connection closed by host with no HTTP status or body.
