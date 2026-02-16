# Federal Accounts Count – Semantic Guide

## What this endpoint does
Returns the number of federal accounts tied to a single award when you supply USAspending's internal digit-only award identifier. Successful calls return a compact object containing the account count.

---

## How to call it
- **Method & path:** `GET /api/v2/awards/count/federal_account/{award_id}/`
- **Auth:** None required in observed calls.
- **Parameters:**
  - `award_id` (path, string, required) – digits only; must reference an internal USAspending award record.

---

## How to interpret the response
- Response is a JSON object with `federal_accounts` (integer ≥ 0) representing how many distinct federal accounts link to the award.
- If the award exists but has no linked accounts, the field is `0`.

---

## Known doc mismatches
- The published example `ASST_NON_NNX17AJ96A_8000` now returns 404.
- Documentation says `award_id` can be assistance/contract strings, but only digit-only internal ids succeed.

---

## Pitfalls & safe-usage checklist
- **Do:** Send the request with a trailing slash to avoid HTTP 301 redirects.
- **Do:** Handle both JSON and HTML 404 responses (HTML appears when non-digit characters are present).
- **Don’t:** Don’t pass public award identifiers; resolve the internal numeric id first.

---

## Runnable examples
```http
GET /api/v2/awards/count/federal_account/222624544/ HTTP/1.1
Host: api.usaspending.gov
```

- Returns `{"federal_accounts": 12}` for this internal award id.
- Replace `222624544` with other digit-only ids; unknown ids respond with JSON 404 detail messages.
