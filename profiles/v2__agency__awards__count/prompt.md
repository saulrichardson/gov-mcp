# Agency Award Counts

Use `GET /api/v2/agency/awards/count/` to retrieve award counts grouped by awarding toptier agency.

## Inputs
- `fiscal_year` (query, integer, optional)
- `group` (query, string, optional; observed values `all` and `cfo`)
- `page` (query, integer, optional)
- `limit` (query, integer, optional)

## Output shape
- `results` (nested array)
- `page_metadata` (pagination details)
- `messages` (warnings/info)

Prefer explicit `fiscal_year` and bounded pagination for deterministic behavior.
