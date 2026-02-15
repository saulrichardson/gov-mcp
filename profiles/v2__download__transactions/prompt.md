# Award Download (Transactions) – Semantic Guide

## What this endpoint does

Starts an asynchronous download job that produces a `.zip` archive for prime transactions and subawards. A successful request returns a `status_url` for polling job state and a `file_url` for downloading the archive once ready.

---

## How to call it

- **Method & path:** `POST /api/v2/download/transactions/`
- **Host:** `api.usaspending.gov`
- **Auth:** Not evidenced (probes do not include auth/header details).
- **Content-Type:** `application/json`

**Body parameters (JSON):**

- `filters` (body, object, required) – Must be a non-empty object.
  - Missing / `null` / non-object -> `400`.
  - Empty `{}` -> `400` with `"At least one filter is required."`
  - **Important:** Unknown filter keys are silently ignored, but can still produce a `200` response.
- `filters.keywords` (body, array, optional) – Array of strings; each string must be length `>= 3`.
- `filters.keyword` (body, string, optional) – Deprecated singular keyword; accepted and validated like `keywords` (min length `>= 3` after normalization).
- `filters.time_period` (body, array, optional) – Must be a non-empty array if present (empty -> `422`; `null` -> `400`). Probes showed objects with only `start_date` or only `end_date` are accepted; invalid date strings -> `400`.
- `filters.recipient_search_text` (body, array, optional) – Must be an array (string input -> `400`). Probes showed multiple entries are accepted.
- `columns` (body, array, optional) – Requested output columns. Not validated at POST time; some column lists later fail asynchronously (see polling below).
- `file_format` (body, string, optional) – Must be one of `csv`, `tsv`, `pstxt` (invalid -> `400`). When omitted, `download_request.file_format` was `csv` in probes.
- `limit` (body, integer, optional) – When omitted, `download_request.limit` was `500000` in probes. Values above `500000` -> `422`. Probes showed `0` and negative values are accepted at POST time (completion behavior not verified).

---

## How to interpret the response

- A `200` response is a JSON object with:
  - `status_url` – A URL you can `GET` to poll job status (observed format: `https://api.usaspending.gov/api/v2/download/status?file_name=...`).
  - `file_name` – The job/archive identifier (also used as `file_name` on the status endpoint).
  - `file_url` – The download URL for the `.zip` archive (observed host: `files.usaspending.gov`).
  - `download_request` – Backend-normalized echo of the request, including injected defaults (e.g., default `award_type_codes`).

**Polling (`status_url`) behavior observed:**

- `GET /api/v2/download/status?file_name=<file_name>` can return:
  - `200` with a JSON object containing at least `status` and `message` (probed `status: "failed"` where `message` contained `"Unknown columns"`).
  - `404` with `{"detail": "Download job with filename ... does not exist."}` when `file_name` is unknown.

---

## Known doc mismatches

- Docs describe `download_request.download_types` as `["sub_awards","transactions"]`, but live responses return `["elasticsearch_sub_awards","elasticsearch_transactions"]`.
- Docs show `status_url` as localhost and `file_url` as a relative `/csv_downloads/...` path, but live responses return fully-qualified HTTPS URLs (`file_url` on `files.usaspending.gov`).
- Docs show `download_request` includes an `agency` field, but probes observed `download_request` without `agency`.
- Endpoint docs define `filters.recipient_search_text` as a string; probes show the API requires an array.
- Shared filters docs say `recipient_search_text` must not exceed 1 item; probes showed multiple items are accepted.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Always send a non-empty `filters` object with at least one supported filter key.
  - Set `limit` explicitly to something reasonable for your use case (default is `500000`).
  - Treat `columns` as “best effort”: poll `status_url` and handle `status="failed"` (e.g., `Unknown columns`).
  - Expect the backend to inject defaults (notably `award_type_codes`) into `download_request.filters` when omitted.
- **Don’t:**
  - Don’t assume typos in `filters` will error; unknown filter keys are silently ignored.
  - Don’t assume a `200` from the POST means the job will succeed; failures can show up only when polling `status_url`.

---

## Runnable examples

```http
POST /api/v2/download/transactions/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filters": {
    "keywords": ["defense"]
  }
}
```

```http
GET /api/v2/download/status?file_name=<file_name_from_post_response> HTTP/1.1
Host: api.usaspending.gov
```
