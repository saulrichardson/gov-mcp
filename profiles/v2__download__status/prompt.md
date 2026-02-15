# Download Status – Semantic Guide

## What this endpoint does
Polls the USAspending download service for the state of a CSV archive identified by its `file_name`. Returns live progress metrics while a job runs and final totals once it finishes. Invalid or expired filenames respond with a plain `detail` error instead of job metadata.

---

## How to call it
- **Method & path:** `GET /api/v2/download/status`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `file_name` (query, string, required) – Must match a known download job filename exactly. Blank values are rejected as missing (400), unknown names return 404. The parameter name is case-sensitive, and if supplied multiple times the last value wins.

---

## How to interpret the response
- Successful responses are objects containing `status`, `message`, `file_name`, `file_url`, `total_size`, `total_columns`, `total_rows`, and `seconds_elapsed`.
- `status` reports the job state (`running` or `finished` observed). `message` stayed `null` for these states.
- `total_rows` and `total_columns` can emit interim counts while `status` is `running`; treat them as provisional until `status` becomes `finished`.
- `file_url` is an absolute HTTPS link to the generated ZIP archive.
- Error responses (400/404) return only `{ "detail": "..." }` with no other fields.

---

## Known doc mismatches
- Docs promise only a 200 body with job metadata, but unknown filenames return 404 with a `detail` string.
- Docs show `file_url` as a relative path; live responses provide absolute HTTPS URLs.
- Docs state `total_rows`/`total_columns` stay null until completion, yet running jobs emitted numeric values.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Poll until `status` changes to `finished` before consuming row/column totals or downloading the archive.
  - Handle 404 `detail` errors as a signal that the filename is invalid or expired and trigger a fresh download request if needed.
  - Expect `total_rows`/`total_columns` to change between polls while `status` is `running`.
- **Don’t:**
  - Don’t assume error payloads follow the documented schema; parse `detail` explicitly.
  - Don’t rely on relative `file_url` paths; use the absolute URL returned by the endpoint.

---

## Runnable examples
```http
GET /api/v2/download/status?file_name=CONT_N0002404C2105_2026-02-15_H03M36S33610999.zip HTTP/1.1
Host: api.usaspending.gov
```
*Observed 200 with `status: "finished"`, `total_rows: 70`, `total_columns: 504`, and an absolute `file_url` once the job completed.*

```http
GET /api/v2/download/status?file_name=foo HTTP/1.1
Host: api.usaspending.gov
```
*Returns 404 with `{"detail": "Download job with filename foo does not exist."}` when the filename is unknown or expired.*
