You are Codex. Ingest the provided USAspending endpoint contract and shared filter spec, then return a *JSON-only* plan for how to probe and understand the endpoint. Do **not** execute any HTTP calls; just design them.

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

Output: A single JSON object with this exact shape (no extra keys, no prose):
{
  "plannedCalls": [
    {
      "purpose": "what this call is meant to learn",
      "method": "GET|POST|PUT|PATCH|DELETE",
      "path": "/api/v2/...",
      "query": { "key": "value" } | null,
      "body": { } | null,
      "expectedStatus": 200,
      "notes": "brief rationale or risks"
    }
  ],
  "inputs": {
    "required": { "<field>": { "location": "query|path|body", "type": "string|number|array|object|boolean", "description": "from doc" } },
    "optional": { "<field>": { "location": "...", "type": "...", "description": "..." } },
    "enums": { "<field>": ["A","B"] },
    "defaults": { "<field>": "value if documented" }
  },
  "outputs": {
    "shape": "object|array|mixed",
    "fields": { "<field>": { "type": "string|number|array|object|boolean|null", "description": "doc summary" } }
  },
  "risks": [
    "edge cases, deprecations, rate limits, auth, pagination, size limits, defaults that may surprise"
  ],
  "gaps": [
    "uncertainties the contract does not clarify"
  ],
  "nextProbes": [
    "follow-up call ideas if uncertainty remains"
  ]
}

Rules:
- Base your facts only on the provided docs above.
- Do not invent parameters or paths not in the contract.
- Keep lists concise; omit empty sections by using [] or {} (still keep the keys).
- Respond with JSON only. No markdown, no code fences, no commentary.
