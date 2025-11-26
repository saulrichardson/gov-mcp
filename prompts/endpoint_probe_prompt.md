You are Codex. Ingest the provided USAspending endpoint contract plus the shared filter spec. Produce a **JSON-only report** that (a) explains the endpoint comprehensively and (b) lays out a complete probe plan to validate it. Do **not** execute HTTP calls; design them with expected assertions.

Context:
- Endpoint relative path: {{ENDPOINT_RELATIVE_PATH}}
- Base URL (for call construction): {{BASE_URL}}
- Endpoint contract (Markdown):
<<<ENDPOINT_DOC>>>
{{ENDPOINT_DOC}}
<<<ENDPOINT_DOC_END>>>
- Shared filters (Markdown; may be referenced by the contract):
<<<SHARED_FILTERS>>>
{{SHARED_FILTERS}}
<<<SHARED_FILTERS_END>>>

Output: A single JSON object with this exact shape (no extra keys, no prose, no code fences):
{
  "endpoint": {
    "relativePath": "{{ENDPOINT_RELATIVE_PATH}}",
    "method": "GET|POST|PUT|PATCH|DELETE",
    "baseUrl": "{{BASE_URL}}",
    "auth": "none|required|unknown",
    "summary": "brief purpose from docs"
  },
  "inputs": {
    "required": { "<field>": { "location": "query|path|body", "type": "string|number|array|object|boolean", "description": "from doc", "constraints": "min/max/pattern if any" } },
    "optional": { "<field>": { "location": "...", "type": "...", "description": "...", "constraints": "..." } },
    "enums": { "<field>": ["A","B"] },
    "defaults": { "<field>": "value if documented" },
    "filtersReferenced": ["filter object names from shared spec that apply"],
    "pagination": { "supported": true|false, "fields": ["page","limit",...], "notes": "from doc" },
    "sorting": { "supported": true|false, "fields": ["sort","order"], "notes": "from doc" }
  },
  "outputs": {
    "shape": "object|array|mixed",
    "fields": { "<field>": { "type": "string|number|array|object|boolean|null", "description": "doc summary" } },
    "paginationFields": ["next","previous","page","hasNext"],
    "errorShapes": { "4xx": "structure if documented", "5xx": "structure if documented" }
  },
  "probePlan": [
    {
      "name": "happy-path minimal",
      "purpose": "verify required-only works",
      "request": { "method": "GET|POST", "path": "/api/v2/...", "query": { }, "body": { } },
      "expects": { "status": 200, "mustHaveFields": ["field1","field2"], "typeChecks": { "field": "string|number|array|object|boolean|null" }, "notes": "assertions to make" }
    },
    {
      "name": "pagination check",
      "purpose": "validate paging behavior",
      "request": { "method": "...", "path": "...", "query": { "page": 1, "limit": 2 }, "body": null },
      "expects": { "status": 200, "paginationBehavior": "describe expected next/prev semantics" }
    }
  ],
  "risks": [
    "edge cases, deprecations, rate limits, auth, pagination, size limits, defaults that may surprise"
  ],
  "gaps": [
    "uncertainties the contract does not clarify"
  ],
  "nextProbes": [
    "follow-up call ideas if uncertainty remains"
  ],
  "docDeviationsToCheck": [
    "specific claims from the contract that should be validated during probes"
  ],
  "examples": {
    "sampleQuery": "fully constructed URL with query if GET",
    "sampleBody": { "onlyIfBody": "fill with doc-based example" }
  }
}

Rules:
- Base your facts only on the provided docs above.
- Do not invent parameters or paths not in the contract.
- Keep lists concise; if no data, use [] or {} (still keep the keys).
- Respond with JSON only. No markdown, no code fences, no commentary.
