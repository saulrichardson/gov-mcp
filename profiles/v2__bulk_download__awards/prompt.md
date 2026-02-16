# Bulk Award Download – Semantic Guide

## What this endpoint does

Submits a bulk download job for prime awards and/or subawards and returns metadata describing where to poll for completion and retrieve the generated archive.

---

## How to call it

- **Method & path:** `POST /api/v2/bulk_download/awards/`
- **Auth:** Not observed in probes (public endpoint).
- **Body parameters:**
  - `filters` (body, object, required) – primary payload; must include `date_range` and at least one of `prime_award_types` or `sub_award_types`.
  - `filters.prime_award_types` (body, array[string], conditional) – allowed values `IDV_A`, `IDV_B`, `IDV_B_A`, `IDV_B_B`, `IDV_B_C`, `IDV_C`, `IDV_D`, `IDV_E`, `02`, `03`, `04`, `05`, `06`, `07`, `08`, `09`, `10`, `11`, `A`, `B`, `C`, `D`, `-1`; require ≥1 item when used.
  - `filters.sub_award_types` (body, array[string], conditional) – allowed values `grant`, `procurement`; require ≥1 item when used.
  - `filters.date_range` (body, object, required) – must include `start_date` and `end_date` (YYYY-MM-DD); start dates before `1980-01-01` or end dates before the start trigger WAF blocks.
  - `filters.date_type` (body, string, recommended) – enum `action_date` or `last_modified_date`; invalid values 400; omission behavior unknown.
  - `filters.agencies` (body, array[object], optional) – each object needs `type` (`funding` or `awarding`), `tier` (`toptier` or `subtier`), and `name`; missing name triggered WAF.
  - `filters.place_of_performance_scope` / `filters.recipient_scope` (body, string, optional) – enum `domestic` or `foreign`.
  - `filters.place_of_performance_locations` / `filters.recipient_locations` (body, array[Location], optional) – each location must include `country`; invalid objects return 422.
  - `filters.keyword` / `filters.keywords` (body, optional) – accepted but dropped from the stored filters; rely on other filters for auditing.
  - `columns` (body, array[string], optional) – arbitrary strings accepted; `null` omits the field; non-array values return 400.
  - `file_format` (body, string, optional) – default `csv`; enum `csv`, `tsv`, `pstxt`.

---

## How to interpret the response

- Response is a JSON object with `status_url`, `file_name`, `file_url`, and `download_request`.
- `status_url` – poll this endpoint to monitor job progress.
- `file_name` – timestamped archive name; matches the `file_url` path.
- `file_url` – direct HTTPS link under `files.usaspending.gov` where the archive will be published.
- `download_request` – sanitized payload the server queued, including `download_types`, `file_format`, optional `columns`, normalized `filters` (`prime_and_sub_award_types`, `time_period`, agency/location filters), and constant `request_type: "award"`.

---

## Known doc mismatches

- Documentation marks `filters.agencies` as required, but probes succeed without it.
- Documentation treats `prime_award_types` as optional, yet the API requires at least one of `prime_award_types` or `sub_award_types`.
- Documentation implies keyword filters are preserved, but the service drops `keyword`/`keywords` from the echoed payload.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Provide at least one of `prime_award_types` or `sub_award_types` with valid codes before submitting.
  - Keep `start_date` ≥ `1980-01-01` and ensure `end_date` ≥ `start_date` to avoid WAF blocks.
  - Poll `status_url` and budget for large downloads; archives can be sizable.
- **Don’t:**
  - Don’t rely on keyword fields to appear in `download_request.filters`; they are stripped.
  - Don’t assume requested column names are validated—verify the output schema downstream.
  - Don’t repeat invalid requests rapidly; WAF blocks can temporarily drop subsequent connections.

---

## Runnable examples

```http
POST /api/v2/bulk_download/awards/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "filters": {
    "prime_award_types": ["A"],
    "date_type": "action_date",
    "date_range": {
      "start_date": "2023-01-01",
      "end_date": "2023-12-31"
    },
    "agencies": [
      {
        "type": "funding",
        "tier": "toptier",
        "name": "Department of Agriculture"
      }
    ]
  },
  "file_format": "csv"
}
```

- Returns 200 with `status_url` for polling, a `file_name`, `file_url`, and a `download_request` echo showing normalized filters.
- `prime_award_types` is rewritten under `download_request.filters.prime_and_sub_award_types.prime_awards`.
- Additional optional filters (recipient/location scopes, columns) echo when provided and pass validation.
