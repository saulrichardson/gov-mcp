# v2/disaster/object_class/count – Semantic Guide

## What this endpoint does

Returns the number of object classes that received disaster/emergency funding when you supply a list of Disaster Emergency Fund Codes (DEFC). The server unions every accepted code and reports a single integer count, returning 0 when no object classes qualify.

---

## How to call it

- **Method & path:** `POST /api/v2/disaster/object_class/count/`
- **Auth:** None required in observed probes.
- **Body filter** (object, required) – Must include `def_codes`; other keys such as `time_period`, `award_type_codes`, `place_of_performance_scope`, or arbitrary fields are accepted but ignored.
- **Body filter.def_codes** (array[string], required) – Allowed values: `1-9`, `A`, multi-letter codes `AAA`–`AAL`, `B`–`Z`, plus `QQQ`. Duplicates allowed; 400 if any entry falls outside this list or is not a string; 422 when the array is empty or omitted; mixing strings with `null`/numbers triggers a 500.
- **Body filter.time_period** (array|null, optional) – Empty arrays, partial ranges, malformed dates, or `null` are accepted with no impact on the count.
- **Body filter.award_type_codes** (array[string], optional) – Any content (including empty arrays or invalid codes) is accepted without affecting the result.

---

## How to interpret the response

- Successful responses are JSON objects containing only `count` (integer ≥ 0).
- `count` reports how many object classes match the provided DEFC filters; expect `0` when none qualify.
- Invalid DEFC values or wrong types return HTTP 400 with a JSON `detail` message; missing or empty arrays return HTTP 422 with a similar `detail` string.
- If the `def_codes` array mixes valid strings with `null` or numeric entries, the service returns HTTP 500 with an HTML error page; sanitize inputs client-side.

---

## Known doc mismatches

- Documentation labels the filter as fixed-type, but the live endpoint silently accepts additional filter properties and ignores them.

---

## Pitfalls & safe-usage checklist

- **Do:** Validate DEFC entries locally against the observed allow-list before calling the API.
- **Do:** Handle 400/422 responses by surfacing the server-provided `detail` string.
- **Don’t:** Rely on `time_period`, `award_type_codes`, or other supplemental filters to shape results—they are ignored.
- **Don’t:** Send `null`, numbers, or whitespace-padded codes in `def_codes`; the server may respond with 400 or 500.

---

## Runnable examples

```http
POST /api/v2/disaster/object_class/count/ HTTP/1.1
Host: api.usaspending.gov
Content-Type: application/json

{"filter":{"def_codes":["L","M","N"]}}
```

- Returns `{"count":35}` for the observed data set.
- Additional shared filters can be omitted because they have no effect on the count.
