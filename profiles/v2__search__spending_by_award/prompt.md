# Search Spending By Award

Use `POST /api/v2/search/spending_by_award/` for filtered award search.

## Required body fields
- `filters`
- `fields`

## Recommended controls
- `page`, `limit`
- `sort`, `order`

## Output shape
- `results`
- `page_metadata`
- optional `messages`

Always send constrained filters and explicit pagination for stable workloads.
