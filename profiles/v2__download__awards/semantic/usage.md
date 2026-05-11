# Award Download

Use `v2__download__awards` when the caller needs a generated ZIP export. The response is a download job descriptor, not award rows.

A small safe request shape:

```json
{
  "filters": {
    "keywords": ["forest"]
  },
  "limit": 1,
  "file_format": "csv",
  "columns": ["award_id_piid", "recipient_name"]
}
```

Successful responses include:

- `status_url`: URL for polling job status.
- `file_name`: ZIP filename and status lookup key.
- `file_url`: eventual generated file URL.
- `download_request`: normalized backend request, including injected defaults.

Treat `download_request` as the effective request. A live probe on `2026-05-09` showed that omitted `award_type_codes` were injected into `download_request.filters`, including `F001` through `F010` in addition to procurement, assistance, IDV, and `-1` values.

Validation behavior observed on `2026-05-09`:

- `filters` must contain at least one key; `{ "filters": {} }` returns 400.
- `file_format` accepts `csv`, `tsv`, and `pstxt`; `xlsx` returns 400.
- A small `limit` is accepted and echoed.

For workflows, preview with `v2__search__spending_by_award` when the user needs immediate JSON rows. Use this endpoint only when the next step is an export job, then poll `v2__download__status` or the returned `status_url` with `file_name`.
