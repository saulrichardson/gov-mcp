# Contract Download – Semantic Guide

## What this endpoint does
Creates a download job for a single contract award and returns the pollable status link, generated archive name, and the snapshot of backend settings that will drive the export.

---

## How to call it
- **Method & path:** `POST /api/v2/download/contract/`
- **Auth:** Not required in observed probes.
- **Parameters:**
  - `award_id` (body, string or integer, required) – Must resolve to an existing contract award; accepts canonical award strings and the internal numeric award ID, including numeric strings.
  - `file_format` (body, string, optional) – Defaults to `csv`; only lowercase `csv`, `tsv`, or `pstxt` succeed. Any other string yields HTTP 400, and non-string JSON values currently trigger a server 500.

---

## How to interpret the response
- Returns a JSON object containing `status_url`, `file_name`, `file_url`, and `download_request`.
- `status_url` and `file_url` are absolute HTTPS links; poll the status URL until it reports `status: "finished"` before downloading the archive.
- `file_name` follows `CONT_<PIID>_<timestamp>.zip`.
- `download_request` echoes backend settings: it always lists the contract dataset trio (`contract_federal_account_funding`, `contract_transactions`, `sub_contracts`), applies the internal numeric `award_id`, includes the contract award type codes (`A`, `B`, `C`, `D`), and surfaces flags such as `include_data_dictionary` and the `limit` (observed 500000 rows).

---

## Known doc mismatches
- Documented file_name suffixes (`_transactions`/`_awards`) do not appear; production responses use `CONT_<PIID>_<timestamp>.zip` instead.

---

## Pitfalls & safe-usage checklist
- **Do:**
  - Force IPv4 (or retry over IPv4) if you receive empty replies; the IPv6 listener drops connections.
  - Validate `file_format` client-side to avoid server-side 500 errors from null or numeric inputs.
  - Poll `status_url` until `status` becomes `finished` before consuming `file_url`.
- **Don’t:**
  - Don’t assume the backend honors extra body fields like `download_types`; they are ignored.
  - Don’t underestimate archive size—exports can include up to 500000 rows per dataset.

---

## Runnable examples
```http
POST /api/v2/download/contract/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{
  "award_id": "CONT_AWD_N0002404C2105_9700_-NONE-_-NONE-"
}
```

- Responds `200` with absolute `status_url` and `file_url`, `file_name` such as `CONT_N0002404C2105_2026-02-13_H22M33S49137532.zip`, and a `download_request` block showing the contract dataset trio and `file_format: "csv"`.
