# v2/budget_functions/list_budget_subfunctions – Semantic Guide

## What this endpoint does

Returns the catalog of federal budget subfunctions. If you provide a valid three-digit, zero-padded budget function code, the list is limited to that family; otherwise the full catalog is returned in ascending title order.

---

## How to call it

- **Method & path:** `POST /api/v2/budget_functions/list_budget_subfunctions/`
- **Auth:** None required in observed probes.
- **Headers:** `Content-Type: application/json` (required for the filter to be honored).
- **Body parameters:**
  - `budget_function` (body, string, optional) – Three-digit, zero-padded code such as `"050"` or `"800"`. Null, empty, or omission fetches the full catalog. Invalid or wrongly formatted values return an empty `results` array without error.

---

## How to interpret the response

- Response is an object with a single observed field: `results` (array).
- Each element is an object containing `budget_subfunction_code` (string) and `budget_subfunction_title` (string).
- Results are sorted ascending by `budget_subfunction_title`.

---

## Known doc mismatches

- None observed.

---

## Pitfalls & safe-usage checklist

- **Do:**
  - Always send `Content-Type: application/json` so budget filters apply.
  - Validate codes client-side; treat empty responses as potential input issues.
- **Don’t:**
  - Don’t expect the API to trim whitespace or coerce numeric inputs.
  - Don’t rely on server-side validation errors for mistyped codes.

---

## Runnable examples

```http
POST /api/v2/budget_functions/list_budget_subfunctions/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"budget_function":"050"}
```

- Returns the National Defense subfunction rows (e.g., `053`, `054`, `051`, `050`).
- An empty array indicates the code was not recognized or formatting was incorrect.
