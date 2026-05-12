# Download Status

## When to use this endpoint
Use `GET /api/v2/download/status` after you have already started a USAspending download job and have its exact `file_name`. This endpoint tells you whether the job is still processing, finished, or failed, and it returns the `file_url` for the generated archive.

## When not to use it
- Do **not** use this endpoint to start a new download job.
- Do **not** use it to inspect award, transaction, or account rows directly.
- Do **not** use it to discover jobs by search criteria; it looks up one exact `file_name`.

## Request shape
- **Method:** `GET`
- **Path:** `/api/v2/download/status`
- **Query parameter:**
  - `file_name` (required, string): exact ZIP filename returned by a prior download endpoint response.

Example template:

```http
GET /api/v2/download/status?file_name=FILE_NAME_FROM_DOWNLOAD_RESPONSE.zip HTTP/1.1
Host: api.usaspending.gov
```

## How to interpret the response
Successful responses describe a single download job and its archive metadata:
- `status`: backend job state. Docs list `ready`, `running`, `finished`, and `failed`, but source code shows additional backend states can exist.
- `message`: usually `null`, but intended for failure context.
- `file_name`: echoes the requested job identifier.
- `file_url`: archive URL to download when the job is ready.
- `total_size`: archive size in kilobytes when known.
- `total_rows` and `total_columns`: counts for generated CSV content.
- `seconds_elapsed`: elapsed processing time serialized as a string.

Observed on 2026-05-12 for a fresh award-download job:
- HTTP 200
- `status: "running"`
- `message: null`
- absolute `file_url`
- `total_size: null`
- `total_rows: 0`
- `total_columns: 0`
- string `seconds_elapsed`

Error responses can instead return only:

```json
{"detail":"..."}
```

That happens for missing, blank, or unknown `file_name` values.

## Response caveats
- Treat `status` as an open-ended backend state string, not a guaranteed closed enum.
- `file_url` should be used exactly as returned.
- `total_rows` and `total_columns` may be provisional before the job reaches a terminal state.
- This endpoint is for job metadata, not the exported spending rows themselves.

## Typical workflow
1. Start a download job from an initiating endpoint such as `v2__download__awards`.
2. Capture the returned `file_name` or extract it from `status_url`.
3. Poll `v2__download__status` with that exact `file_name`.
4. When the job reaches a successful terminal state, use `file_url` to fetch the archive.
5. If the job fails, inspect `message` when present or restart the download workflow.

## Safe usage tips
- Preserve `file_name` exactly as returned; near matches are not resolved.
- Handle 400/404 error payloads separately from 200 responses.
- Avoid treating nonterminal row and column totals as final analytical facts.
