# Evaluation Layer

This directory contains black-box evaluation scripts for the USAspending MCP.

These scripts are intentionally **not** part of the MCP implementation surface:

- they start the stdio MCP server as an external process
- they interact with it through the MCP client SDK
- they make real USAspending API calls through the raw MCP tools
- they are not part of `make ship-verify`
- they do not define MCP tools, resources, or server behavior

Use this layer for higher-level analyst exercises, exploratory evaluations, and end-to-end black-box checks that should not live inside the MCP package itself.

Current entrypoints:

- `scripts/evals/bin/analyst-scenarios`
- `scripts/evals/bin/raw-analysis-bench`
