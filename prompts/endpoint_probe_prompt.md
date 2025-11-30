Ingest the provided USAspending endpoint contract plus the shared filter spec. Then **exhaustively learn the endpoint** by running a **rich, systematic suite of live probes** against the API and reconciling docs vs reality. Your goal is to understand **every parameter, behavior, and output field** as fully as possible. Return one **JSON-only** report with your findings, contract, and probe evidence.

---

## Context

(All doc content is inlined; do NOT read from disk or fetch anything except calling the live API host.)

* **Endpoint name (label only):**
  `{{ENDPOINT_RELATIVE_PATH}}`

  * Human-readable label only (e.g., `/api/v2/awards/`).
  * Use this exact value as `"contract.name"` in the final JSON.

* **Base URL (for live calls):**
  `{{BASE_URL}}`

  * All HTTP requests MUST go to this host.
  * Do not call any other hosts or external services.

* **Endpoint contract (Markdown, full text provided):**

  ```text
  <<<ENDPOINT_DOC>>>
  {{ENDPOINT_DOC}}
  <<<ENDPOINT_DOC_END>>>
  ```

  * Primary written specification for this endpoint:

    * HTTP method(s) and path(s).
    * Parameters (body/query/path), filters, sorting, pagination.
    * Data types, enums, defaults, constraints.
    * Errors, status codes, examples.

* **Shared filters (Markdown, may be referenced by the contract):**

  ```text
  <<<SHARED_FILTERS>>>
  {{SHARED_FILTERS}}
  <<<SHARED_FILTERS_END>>>
  ```

  * Reusable filter definitions and field structures.
  * Treat these as part of the contract whenever referenced.

You MAY call the live API at `{{BASE_URL}}` using the methods/paths in the contract. For every probe you run, record the request/response (status + trimmed body) in the `probes` array of your JSON report. Do not attempt to read any files; rely only on the inlined docs above and live responses.

---

## Overall Goal

Treat the docs as a **hypothesis** and the live API as the **source of truth**. For this endpoint, you must:

* **Conduct the richest possible set of live probes**:

  * Systematically vary parameters, types, values, combinations, pagination, and sorting.
  * Explore valid, boundary, and invalid cases.
* **Fully understand how the endpoint works**:

  * What each input field does, how it interacts with others, and what happens when it is missing or malformed.
  * The complete shape and semantics of the response, including pagination and edge cases.
  * Defaults, constraints, nullability, and doc vs reality mismatches.

Write your final JSON report to the file:

`{{OUTPUT_SUMMARY_PATH}}`

The file must contain exactly one JSON object with top-level keys:
`contract`, `probes`, `mismatches`, `gaps`, `risks`.

Do **not** print the JSON in chat. When the file is written successfully, print only: `DONE`.

## Required JSON shape (example)

```json
{
  "contract": {
    "name": "{{ENDPOINT_RELATIVE_PATH}}",
    "endpoint": { "method": "GET|POST|PUT|PATCH|DELETE", "host": "{{BASE_URL}}", "path": "/api/v2/..." },
    "description": "brief purpose from docs/observations",
    "inputSchema": {
      "type": "object",
      "properties": {
        "<field>": {
          "location": "query|path|body",
          "type": "string|number|array|object|boolean|null",
          "description": "doc + observed",
          "constraints": "min/max/pattern/enum if any"
        }
      },
      "required": ["..."]
    },
    "outputSchema": {
      "type": "object|array|mixed",
      "properties": {
        "<field>": {
          "type": "string|number|array|object|boolean|null",
          "description": "observed shape"
        }
      },
      "required": ["..."]
    },
    "examples": [
      {
        "request": { "method": "GET|POST", "path": "/api/v2/...", "query": { }, "body": { } },
        "response": { "status": 200, "body": { "...": "trimmed" } }
      }
    ],
    "quirks": [
      "doc vs reality mismatches, nullability surprises, pagination quirks, defaults, deprecations"
    ]
  },
  "probes": [
    {
      "request": { "method": "GET|POST", "path": "/api/v2/...", "query": { }, "body": { } },
      "response": { "status": 200, "bodyExcerpt": "{...}", "contentType": "application/json" },
      "notes": "pass|fail and key observations"
    }
  ],
  "mismatches": [
    "doc claims that differed from observed responses"
  ],
  "gaps": [
    "unknowns not resolved by probes"
  ],
  "risks": [
    "edge cases, rate limits, pagination, auth, size limits, unstable fields"
  ]
}
```

---

## Allowed actions and constraints

1. **You MUST:**

   * Use only HTTP methods and paths explicitly documented in `{{ENDPOINT_DOC}}` for this endpoint.
   * Capture **every** probe (request + response) you use to learn behavior.
   * Base all facts on:

     * `{{ENDPOINT_DOC}}`
     * `{{SHARED_FILTERS}}`
     * Live responses from `{{BASE_URL}}`

2. **You MUST NOT:**

   * Invent new paths or HTTP methods not in the contract.
   * Invent new parameters not in the contract, or only implicitly discovered from errors.
   * Read from disk, or fetch external docs/resources.

Within those constraints, be aggressive and thorough in exploring the endpoint.

---

## Methodology

### 1. Build a doc-based hypothesis

1.1 **Identify the primary endpoint:**

* From `{{ENDPOINT_DOC}}`, determine:

  * The main HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
  * The corresponding path (e.g., `/api/v2/awards/`).
* If multiple closely related paths/methods are documented for this endpoint, focus on the one matching `{{ENDPOINT_RELATIVE_PATH}}` for `"contract.endpoint"`, but you may probe related variants to clarify behavior.

1.2 **Catalog all documented inputs:**

For each parameter mentioned in the contract or shared filters:

* Record:

  * **Location**: `query`, `path`, or `body`.
  * **Type**: `string`, `number`, `array`, `object`, `boolean`, or `null`.
  * **Structure**: For nested objects/arrays, note their subfields as far as docs specify.
* Capture all documented **constraints**:

  * Required vs optional.
  * Enums or allowed sets.
  * Ranges and limits (min/max).
  * Formats (e.g., `YYYY-MM-DD`, UUID).
  * Defaults and fallbacks if omitted.
* If the contract refers to shared filters (e.g., “`filters` uses the shared filter schema”), inline the structure from `{{SHARED_FILTERS}}` into your understanding.

1.3 **Catalog all documented outputs and behaviors:**

* Determine the documented **response shape**:

  * Root type (object/array).
  * Top-level fields (e.g., `results`, `count`, `page_metadata`).
* Note all documented behaviors that need verification:

  * Pagination, sorting, filtering semantics.
  * Error codes and structures.
  * Special conditions (empty results, 404 vs 200 for “not found”, etc.).

This gives you a complete **initial hypothesis** to test.

---

### 2. Design a rich probing strategy

You are expected to run **many** probes, not just a few. Design a plan that:

2.1 **Covers core “happy paths” thoroughly:**

* At least one **minimal valid request**:

  * Exactly the documented required fields, nothing optional.
* Multiple **typical valid requests**:

  * Include common filters, date ranges, types, sorts, and pagination.
* Several **realistic combinations**:

  * Different filter values (e.g., award types, agencies, date ranges).
  * Different sorting and pagination options.

2.2 **Explores each input dimension in depth:**

For **every input field**, design probes that:

* Toggle **presence vs absence**:

  * Include the field with a typical value.
  * Omit the field entirely (when not path-bound) to see defaults and error behavior.
* Explore **value variety**:

  * Typical/median values.
  * Alternate valid categories (e.g., different enum values).
  * Boundary values within documentation (e.g., smallest/largest dates, min/max numbers).
* Explore **type edges** (within reason and contract):

  * If a field is documented as a string, try:

    * Empty string (if plausible),
    * Short and longer values within limits.
  * If an array:

    * Empty array,
    * Single-element array,
    * Multi-element array with different value patterns.
* Explore **nullability** where allowed:

  * Send `null` for fields that are documented nullable to see behavior.

2.3 **Explore combined behaviors:**

* Combine multiple filters and controls to see interactions:

  * Multiple filter constraints at the same time.
  * Filters plus sorting.
  * Filters plus pagination (e.g., filtered results across pages).
* Look for:

  * Filters that override or conflict with each other.
  * Fields that only appear when certain filters are used.

2.4 **Map pagination and limits exhaustively (if applicable):**

* Probe:

  * Different `page` values (1, 2, and high values).
  * Different `limit`/`page_size` values:

    * Small limit (e.g., 1–5),
    * Typical limit,
    * Near documented max.
* Observe:

  * Whether docs’ default page/limit values match reality.
  * Response metadata fields (next/prev links, total counts, etc.).
  * Behavior when requesting pages beyond available data (e.g., empty results vs error).

2.5 **Map sorting semantics (if applicable):**

* Test:

  * Omitted `sort` parameter (default sort).
  * Each documented `sort` field and direction.
  * Invalid `sort` values to trigger errors.
* Check:

  * That results actually appear sorted as requested.
  * Any tie-breaking behavior if visible.

2.6 **Explore error and validation surfaces:**

For key parameters, send **invalid** variants to reveal constraints and error structures:

* Missing required fields.
* Invalid enum values.
* Out-of-range numbers.
* Malformed dates.
* Wrong types (e.g., number where string expected) where still within contract constraints.
* Malformed filter objects/arrays.

Use these to learn:

* Exact status codes (400 vs 422 vs 500).
* Error response shape and fields (e.g., `detail`, `messages`, `errors`).
* How error messages refer to fields (which may reveal hidden constraints or naming).

2.7 **Probe for volume and stability (within reason):**

* Slightly larger result sets (e.g., larger date ranges or higher limits) to see:

  * Maximum practical page size before any truncation or performance warnings.
  * Whether large requests fail differently.
* Repeat a few identical requests:

  * To see if response shape and structure are stable (even if data changes).

You are not expected to abuse the API (no extreme loads), but **within normal use**, strive for the richest practical coverage.

---

### 3. Execute probes and capture evidence

For **every** HTTP request you send:

3.1 **Record the request object:**

* `"method"`: `"GET"`, `"POST"`, `"PUT"`, `"PATCH"`, or `"DELETE"`.
* `"path"`: the full relative path (e.g., `"/api/v2/awards/"`).
* `"query"`:

  * A JSON object of all query parameters and values actually sent.
* `"body"`:

  * A JSON object containing the request body you sent, or `{}` if no body.

3.2 **Record the response object:**

* `"status"`: numeric HTTP status code.
* `"bodyExcerpt"`:

  * A **string** containing a trimmed JSON snippet of the response body:

    * Enough to show structure and key fields,
    * Do not paste the entire large response; abbreviate arrays/objects.
* `"contentType"`:

  * The `Content-Type` header, e.g., `"application/json"`.

3.3 **Annotate each probe with notes:**

* `"notes"`:

  * Indicate whether the result matched the documentation (`"pass"` or `"fail"`).
  * Briefly summarize what you learned, such as:

    * “Missing `filters` returns 400 with `detail` message.”
    * “Omitting `page` defaults to 1; `limit` defaults to 10.”
    * “Invalid enum value in `award_type` returns 400 with field-level error.”

Your `"probes"` array should contain **all** such probe records used to derive your understanding.

---

### 4. Derive the input schema from docs + probes

Using all documentation and probe evidence, construct `"contract.inputSchema"`:

4.1 **Enumerate all input fields:**

* Include:

  * All documented parameters (contract + shared filters).
  * Any additional fields clearly revealed by error messages or responses (e.g., documented but only discovered via probing).
* For each field, define:

  * `"location"`: `"query"`, `"path"`, or `"body"`.
  * `"type"`: `"string"`, `"number"`, `"array"`, `"object"`, `"boolean"`, or `"null"`.
  * `"description"`:

    * Based on combined docs + live behavior.
    * Mention role (e.g., filter by date range, control pagination).
  * `"constraints"`:

    * All known constraints:

      * Required vs optional.
      * Enum values.
      * Range and length limits.
      * Format expectations.
      * Default behavior when omitted.
    * If partially known, state the limits of what you tested.

4.2 **Identify required fields:**

* `"inputSchema.required"` should list fields that:

  * Are truly required by the live API (requests missing them fail).
* If docs say a field is required but live API treats it as optional:

  * Do **not** mark it as required.
  * Capture the discrepancy in `"mismatches"`.

Do not invent fields or mark them required without evidence.

---

### 5. Derive the output schema and behaviors

Using the union of all successful responses:

5.1 **Determine root output type:**

* If all successful responses have a top-level JSON object:

  * `"outputSchema.type": "object"`.
* If all are arrays:

  * `"outputSchema.type": "array"`.
* If it varies (object vs array, or other differences based on request):

  * `"outputSchema.type": "mixed"` and clarify in `"quirks"`.

5.2 **Enumerate key fields and their semantics:**

For each recurring top-level field:

* Add an entry in `"outputSchema.properties"`:

  * `"type"`: based on observed values (`string`, `number`, `array`, `object`, `boolean`, `null`).
  * `"description"`:

    * Explain what it represents (counts, metadata, a list of items, etc.).
    * Include any significant nuances (e.g., when it can be null or missing).

For nested structures (e.g., elements of `results` arrays):

* At minimum, describe:

  * The role of the array or object.
  * Key nested fields if they are important for understanding or integration.
* You do **not** need a full deep schema of every nested field, but the description should be enough for a developer to work with the endpoint confidently.

5.3 **Identify required output fields:**

* `"outputSchema.required"` should list fields that:

  * Appear in all successful responses and are fundamental (e.g., `results`, `count`).
* Optional or conditionally present fields:

  * Should **not** be in `"required"`.
  * Their optionality/nullability should be described in the relevant property or `"quirks"`.

---

### 6. Build concrete examples based on real probes

Populate `"contract.examples"` with at least one (preferably multiple) **real** examples:

Each example includes:

* `"request"`:

  * `"method"`: as used.
  * `"path"`: exact path used.
  * `"query"`: query parameters as sent.
  * `"body"`: request body as sent (or `{}`).

* `"response"`:

  * `"status"`: typically `200` for examples (unless demonstrating a documented error).
  * `"body"`:

    * A **trimmed** JSON object representing the response body:

      * Enough to show the key structure and fields.
      * You may omit unneeded nested detail.

These examples should be representative of typical usage patterns and directly traceable to entries in `"probes"`.

---

### 7. Summarize quirks, mismatches, gaps, and risks

Use these fields to concisely summarize what you learned beyond the raw schemas:

* `"contract.quirks"`:

  * A list of human-readable observations about:

    * Doc vs reality differences in behavior (not schema — schema-level go in `"mismatches"`).
    * Nullability surprises.
    * Pagination oddities.
    * Defaults that are not clearly documented.
    * Any configuration or behavior that might surprise a consumer.

* `"mismatches"`:

  * Each entry is a specific doc vs reality discrepancy, for example:

    * `"Docs say 'limit' max is 100, but API accepts 500 and returns 500 items."`
    * `"Docs say missing 'filters' returns 400, but API returns 200 with all results."`

* `"gaps"`:

  * Things you **still do not know**, even after rich probing, e.g.:

    * `"True maximum 'limit' not determined; only tested up to 500."`
    * `"Unclear if sorting is stable across pages."`

* `"risks"`:

  * Potential integration risks or edge cases, e.g.:

    * `"Large unfiltered queries may return huge responses; client should always use filters and pagination."`
    * `"Error response shape differs between 400 and 500; clients must handle both."`
    * `"Some fields appear only for certain award types; schema is partially dynamic."`

If any of these lists are empty, include them as `[]` but keep the keys.

---

## Final Output Format (STRICT)

You must write exactly one JSON object with top-level keys
`contract`, `probes`, `mismatches`, `gaps`, `risks` to `{{OUTPUT_SUMMARY_PATH}}`.

Do not add or remove top-level keys. No markdown, no code fences, no commentary in chat.

When the file is successfully written, print only: `DONE`.
