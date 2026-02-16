# Bulk Download Status – Semantic Guide

## What this endpoint does
Returns nothing in practice: every observed call to `https://api.usaspending.gov/api/v2/bulk_download/status` closes immediately after TLS without producing an HTTP response, despite documentation describing a JSON job-status payload.

---

## How to call it
- **Method & path:** `GET /api/v2/bulk_download/status`
- **Auth:** No authentication was supplied during probes; the server still terminated the connection, so requirements remain unknown.
- **Parameters:** None confirmed. Documentation references a `file_name` query string, but the live service never responds, so treat all inputs as speculative.

---

## How to interpret the response
- The server never sends an HTTP status or body; expect the client connection to abort (e.g., curl error 52 / `RemoteDisconnected`).
- Because no payload is delivered, there is no reliable way to observe fields such as `status`, `message`, or download metrics.

---

## Known doc mismatches
- Documentation promises a 200 JSON object describing bulk download status, but the host drops the connection before sending any HTTP response.

---

## Pitfalls & safe-usage checklist
- **Do:** Detect and surface the connection-abort condition quickly so operators know the request failed.
- **Do:** Consider coordinating with API owners before integrating; the published endpoint appears non-functional.
- **Don’t:** Rely on the documented schema or fields until you have verified a working response in your environment.
- **Don’t:** Point code at `www.usaspending.gov/api/...` expecting JSON—the front-end host serves HTML for this path.

---

## Runnable examples
```http
GET /api/v2/bulk_download/status?file_name=foo.zip HTTP/1.1
Host: api.usaspending.gov
```

// Server closes the connection without returning HTTP headers or body.
