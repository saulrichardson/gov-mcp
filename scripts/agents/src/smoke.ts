import { loadAgentEnvironment } from "./env.js";
import { createSemanticEndpointAgent } from "./endpointAgent.js";

function main() {
  const envStatus = loadAgentEnvironment();
  const agent = createSemanticEndpointAgent({
    outRoot: "runs/agents-sdk-smoke",
    model: process.env.OPENAI_AGENT_MODEL || "gpt-5.4",
    reasoningEffort: "high",
    promote: false,
    currentDate: "2026-05-09",
  });

  console.log(
    JSON.stringify(
      {
        event: "agents_sdk_smoke_ok",
        hasOpenAIKey: envStatus.hasOpenAIKey,
        usedCodexKeyAlias: envStatus.usedCodexKeyAlias,
        agentName: agent.name,
        toolCount: agent.tools.length,
        toolNames: agent.tools.map((tool) => tool.name),
        outputType: agent.outputSchemaName,
      },
      null,
      2
    )
  );
}

main();
