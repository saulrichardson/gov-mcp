Ingest the provided USAspending endpoint contract plus the shared filter spec. Then fully learn the endpoint by *running live probes* against the API and reconciling docs vs reality. Return one **JSON-only** report with your findings, contract, and probe evidence.

Context (all doc content is inlined; do NOT read from disk or fetch anything except calling the live API host):
- Endpoint name (for labeling only): {{ENDPOINT_RELATIVE_PATH}}
- Base URL (for live calls): {{BASE_URL}}
- Endpoint contract (Markdown, full text provided): {{ENDPOINT_DOC}}
- Shared filters (Markdown; may be referenced by the contract): {{SHARED_FILTERS}}

You MAY call the live API at {{BASE_URL}} using the methods/paths in the contract. Capture every request and response you send/receive. Do not attempt to read any files; rely only on the inlined docs above and live responses.

Output: A single JSON object with this exact shape (no extra keys, no prose, no code fences):
{
  "contract": {
    "name": "{{ENDPOINT_RELATIVE_PATH}}",
    "endpoint": { "method": "GET|POST|PUT|PATCH|DELETE", "host": "{{BASE_URL}}", "path": "/api/v2/..." },
    "description": "brief purpose from docs/observations",
    "inputSchema": {
      "type": "object",
      "properties": { "<field>": { "location": "query|path|body", "type": "string|number|array|object|boolean|null", "description": "doc + observed", "constraints": "min/max/pattern/enum if any" } },
      "required": ["..."]
    },
    "outputSchema": {
      "type": "object|array|mixed",
      "properties": { "<field>": { "type": "string|number|array|object|boolean|null", "description": "observed shape" } },
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

Rules:
- Base your facts only on the provided docs above.
- Do not invent parameters or paths not in the contract.
- Keep lists concise; if no data, use [] or {} (still keep the keys).
- Respond with JSON only. No markdown, no code fences, no commentary.
