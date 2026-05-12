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

## Preview-to-download continuity caveat

Use `v2__search__spending_by_award` to preview the same filtered population before exporting, but keep the continuity boundary explicit:

- Continuity is at the **filter-population** level only.
- Preview `fields` are display labels like `Award ID`, `Recipient Name`, `Award Amount`, and `Awarding Agency`; they are **not** download column IDs.
- Preview controls such as `sort`, `order`, `page`, and preview `limit` do **not** define the export row order or export schema.
- In the reviewed workflow, the preview call used labeled fields plus sort/paging controls, while the download response echoed an effective `download_request` with `filters`, `columns`, `limit`, and `file_format` only.
- If a pipeline needs to compare preview output with the export, choose explicit identifier columns on purpose rather than assuming the first preview row or preview label schema carries forward.

## Curated preview-to-export crosswalk

These are the common dashboard fields this bundle can now explain. Verification depth differs: `award_id_piid` and `recipient_name` were reviewer-confirmed end-to-end in a bounded CSV, while `total_obligated_amount` and `awarding_agency_name` are source-backed mappings that have not yet been re-confirmed by reviewed ZIP header inspection in this bundle.

| Preview label in `spending_by_award` | Download column ID | Current evidence status | Meaning for pipeline consumers |
| --- | --- | --- | --- |
| `Award ID` | `award_id_piid` | Reviewer-confirmed bounded CSV header; source-backed column mapping | PIID-style contract award identifier. Good contract-oriented join key, but not universal across mixed award types. |
| `Recipient Name` | `recipient_name` | Reviewer-confirmed bounded CSV header; source-backed column mapping | Recipient legal/business name on the exported award row. |
| `Award Amount` | `total_obligated_amount` | Source-backed mapping | Closest export column to the preview's award amount measure; both preview and award-download mappings trace this field family to `total_obligation`. |
| `Awarding Agency` | `awarding_agency_name` | Source-backed mapping | Closest export column to the preview's awarding agency display name. |

Important identifier caveat: source-defined award download mappings also expose `award_id_fain` and `award_id_uri`, so do not assume `award_id_piid` is the only identifier column for mixed award-type exports.

Validation behavior observed on `2026-05-09`:

- `filters` must contain at least one key; `{ "filters": {} }` returns 400.
- `file_format` accepts `csv`, `tsv`, and `pstxt`; `xlsx` returns 400.
- A small `limit` is accepted and echoed.

This is still not a full export catalog. If a pipeline needs additional preview fields beyond `Award ID`, `Recipient Name`, `Award Amount`, and `Awarding Agency`, treat those mappings as unresolved until they are verified by another bounded export or a source-backed column review.

For workflows, preview with `v2__search__spending_by_award` when the user needs immediate JSON rows. Use this endpoint when the next step is an export job, then poll `v2__download__status` or the returned `status_url` with `file_name`.
