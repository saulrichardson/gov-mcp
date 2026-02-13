# Recipient Count

Use `POST /api/v2/recipient/count/` to get aggregate recipient cardinality for a filtered population.

## Required body fields
- `filters`

## Output shape
- `count`
- optional `messages`

Use the same filter semantics you apply to award-search endpoints for consistent counts.
