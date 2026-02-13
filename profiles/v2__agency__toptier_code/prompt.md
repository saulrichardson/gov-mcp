# Agency By Toptier Code

Use `GET /api/v2/agency/{toptier_code}/` to fetch a single agency profile.

## Inputs
- `toptier_code` (path, required)
- `fiscal_year` (query, optional)

## Output shape
- Agency metadata fields (`name`, `toptier_code`, fiscal-year-specific content)
- `messages` list for warnings

Validate `toptier_code` format before requests to avoid non-JSON 404 responses.
