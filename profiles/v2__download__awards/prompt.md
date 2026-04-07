# Award Download – Semantic Guide

## What this endpoint does
Initiates an award-download job and returns absolute URLs for polling job status and retrieving the generated ZIP archive. The backend normalizes your request, injects defaults such as award type codes, and echoes the effective configuration in the response.

---

## How to call it
- **Method & path:** `POST /api/v2/download/awards/`
- **Auth:** Not required in observed probes.
- **Body fields:**
  - `filters` (body, object, required) – Must be non-empty. Accepts the Search Filters v2 structure (agencies, keywords, time_period, etc.). Unknown keys are silently dropped; when `time_period` is present it must contain at least one entry, agency objects must include `type` and `tier`, and `recipient_search_text` must be an array.
  - `columns` (body, array, optional) – Strings identifying columns to include. Server does not validate names and echoes them back verbatim.
  - `file_format` (body, string, optional) – Defaults to `csv`. Observed valid values: `csv`, `tsv`, `pstxt`. Other values return HTTP 400.
  - `limit` (body, number, optional) – Defaults to `500000`. Values above `500000` return HTTP 422. Zero or negative limits are accepted but downstream impact is unknown.

---

## How to interpret the response
- Returns a JSON object with `status_url`, `file_name`, `file_url`, and `download_request`.
- `status_url` and `file_url` are absolute HTTPS links; use `status_url` to poll until the job reaches `finished`, then follow `file_url`.
- `download_request` mirrors the processed request: it always includes `download_types` set to `['elasticsearch_awards', 'elasticsearch_sub_awards']`, injects a broad `award_type_codes` list, and echoes your effective filters, columns, limit, file_format, and `request_type`.

---

## Known doc mismatches
- Documentation claims `download_types` are `['awards','sub_awards']`, but the API returns `['elasticsearch_awards','elasticsearch_sub_awards']`.
- Documentation shows `file_url` as a relative path; production responses are absolute HTTPS URLs.
- Documentation limits `recipient_search_text` to one value; the API accepts multi-entry arrays.
- Documentation treats `transaction_keyword_search` as persisted, yet the API drops it from `download_request.filters`.

---

## Pitfalls & safe-usage checklist
- **Do:** Inspect `download_request` to confirm the filters the server will apply before relying on the resulting file.
- **Do:** Force IPv4 or retry if you encounter connection resets, which have appeared over IPv6.
- **Do:** Supply precise filters and reasonable limits to avoid unexpectedly large exports.
- **Don't:** Assume typos in filter keys or column names will raise errors; the API silently ignores unknown filters and echoes unknown columns.
- **Don't:** Rely on `transaction_keyword_search` until the API begins persisting it.

---

## Runnable examples
```http
POST /api/v2/download/awards/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filters": {
    "keywords": ["forest"]
  }
}
```

- Responds `200 OK` with absolute `status_url`/`file_url`, default `limit` of 500000, and injected `award_type_codes` in `download_request`.
- Verify that `download_request.filters` matches your intent before following the `file_url`.
