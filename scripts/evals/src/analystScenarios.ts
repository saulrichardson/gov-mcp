import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Client } from "../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      (timer as any).unref?.();
    }),
  ]);
}

type DiscoveryExpectation = {
  query: string;
  expectedSlug: string;
  expectedToolName: string;
};

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const repoRoot = join(__dirname, "..", "..", "..");
  const serverBin = join(repoRoot, "scripts", "mcp", "bin", "stdio-server");

  const timeoutMs = Number(process.env.ANALYST_TIMEOUT_MS ?? 15_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`invalid ANALYST_TIMEOUT_MS: expected positive number, got '${process.env.ANALYST_TIMEOUT_MS}'`);
  }

  const transport = new StdioClientTransport({
    command: serverBin,
    args: [],
    cwd: repoRoot,
    stderr: "pipe",
  });

  let serverStderr = "";
  transport.stderr?.on("data", (chunk: any) => {
    serverStderr += String(chunk?.toString?.() ?? chunk);
  });

  const client = new Client(
    { name: "gov-gpt-analyst-scenarios", version: "0.1.0" },
    { capabilities: {} }
  );

  const startedAt = new Date().toISOString();
  const discoveryExpectations: DiscoveryExpectation[] = [
    {
      query: "investigate spending trends over time",
      expectedSlug: "v2__search__spending_over_time",
      expectedToolName: "usaspending.v2__search__spending_over_time",
    },
    {
      query: "award detail",
      expectedSlug: "v2__awards__award_id",
      expectedToolName: "usaspending.v2__awards__award_id",
    },
    {
      query: "download status",
      expectedSlug: "v2__download__status",
      expectedToolName: "usaspending.v2__download__status",
    },
    {
      query: "search awards",
      expectedSlug: "v2__search__spending_by_award",
      expectedToolName: "usaspending.v2__search__spending_by_award",
    },
    {
      query: "recipient trend",
      expectedSlug: "v2__search__spending_over_time",
      expectedToolName: "usaspending.v2__search__spending_over_time",
    },
    {
      query: "agency trend",
      expectedSlug: "v2__search__spending_over_time",
      expectedToolName: "usaspending.v2__search__spending_over_time",
    },
    {
      query: "recipient lookup",
      expectedSlug: "v2__recipient",
      expectedToolName: "usaspending.v2__recipient",
    },
    {
      query: "agency lookup",
      expectedSlug: "v2__autocomplete__awarding_agency",
      expectedToolName: "usaspending.v2__autocomplete__awarding_agency",
    },
  ];

  try {
    await withTimeout(
      client.connect(transport),
      timeoutMs,
      `timeout connecting to MCP server after ${timeoutMs}ms; stderr=${serverStderr}`
    );

    const listedTools = await withTimeout(
      client.listTools(),
      timeoutMs,
      `timeout listing MCP tools; stderr=${serverStderr}`
    );
    const toolNames = Array.isArray((listedTools as any)?.tools)
      ? (listedTools as any).tools.map((tool: any) => tool?.name).filter((name: any) => typeof name === "string")
      : [];

    for (const disallowedTool of [
      "usaspending.searchAwards",
      "usaspending.getAward",
      "usaspending.getSpendingTrend",
      "usaspending.createDownload",
      "usaspending.pollDownload",
    ]) {
      assert(!toolNames.includes(disallowedTool), `raw-only MCP exposed disallowed workflow tool '${disallowedTool}'`);
    }

    const discoveryChecks = [];
    for (const expectation of discoveryExpectations) {
      for (const toolName of ["usaspending.findCapabilities", "usaspending.findEndpoints"]) {
        const response = await withTimeout(
          client.callTool({
            name: toolName,
            arguments: { query: expectation.query, limit: 5 },
          }),
          timeoutMs,
          `timeout calling ${toolName} for query='${expectation.query}'; stderr=${serverStderr}`
        );
        const results = (response as any)?.structuredContent?.results || [];
        const match = results.find((item: any) => item.slug === expectation.expectedSlug);
        assert(match, `${toolName} failed to discover slug='${expectation.expectedSlug}' for query='${expectation.query}'`);
        const returnedToolName = toolName === "usaspending.findCapabilities" ? match.preferredToolName : match.toolName;
        assert(
          returnedToolName === expectation.expectedToolName,
          `${toolName} returned toolName='${returnedToolName}' for slug='${expectation.expectedSlug}', expected '${expectation.expectedToolName}'`
        );
        discoveryChecks.push({
          tool: toolName,
          query: expectation.query,
          slug: match.slug,
          toolName: returnedToolName,
          rank: results.findIndex((item: any) => item.slug === expectation.expectedSlug) + 1,
        });
      }
    }

    const trendResponse = await withTimeout(
      client.callTool({
        name: "usaspending.v2__search__spending_over_time",
        arguments: {
          group: "fiscal_year",
          filters: {
            keywords: ["infrastructure"],
            time_period: [{ start_date: "2021-10-01", end_date: "2025-09-30" }],
          },
          spending_level: "transactions",
        },
      }),
      timeoutMs,
      `timeout calling usaspending.v2__search__spending_over_time; stderr=${serverStderr}`
    );
    const trend = (trendResponse as any)?.structuredContent;
    const trendRows = trend?.body?.results;
    assert(Array.isArray(trendRows) && trendRows.length >= 2, "spending_over_time returned too few time buckets");

    const healthResponse = await withTimeout(
      client.callTool({
        name: "usaspending.getEndpointHealth",
        arguments: { slug: "v2__search__spending_over_time" },
      }),
      timeoutMs,
      `timeout calling usaspending.getEndpointHealth; stderr=${serverStderr}`
    );
    const health = (healthResponse as any)?.structuredContent;
    assert(health?.shipTier === "representative", "trend endpoint health did not report representative ship tier");

    const recipientLookupResponse = await withTimeout(
      client.callTool({
        name: "usaspending.v2__recipient",
        arguments: {
          keyword: "Lockheed",
          limit: 1,
          sort: "amount",
          order: "desc",
        },
      }),
      timeoutMs,
      `timeout calling usaspending.v2__recipient; stderr=${serverStderr}`
    );
    const recipient = (recipientLookupResponse as any)?.structuredContent?.body?.results?.[0];
    assert(recipient, "recipient lookup returned no results");
    const recipientSearchValue = recipient.uei || recipient.duns || recipient.name;
    assert(typeof recipientSearchValue === "string" && recipientSearchValue.length > 0, "recipient lookup returned no reusable identifier");

    const recipientTrendResponse = await withTimeout(
      client.callTool({
        name: "usaspending.v2__search__spending_over_time",
        arguments: {
          group: "fiscal_year",
          filters: {
            recipient_search_text: [recipientSearchValue],
            time_period: [{ start_date: "2021-10-01", end_date: "2025-09-30" }],
          },
          spending_level: "transactions",
        },
      }),
      timeoutMs,
      `timeout calling recipient trend; stderr=${serverStderr}`
    );
    const recipientTrend = (recipientTrendResponse as any)?.structuredContent;
    assert(
      Array.isArray(recipientTrend?.body?.results) && recipientTrend.body.results.length >= 2,
      "recipient trend returned too few time buckets"
    );

    const agencyLookupResponse = await withTimeout(
      client.callTool({
        name: "usaspending.v2__autocomplete__awarding_agency",
        arguments: {
          search_text: "Agriculture",
          limit: 10,
        },
      }),
      timeoutMs,
      `timeout calling awarding agency autocomplete; stderr=${serverStderr}`
    );
    const agencyResults = (agencyLookupResponse as any)?.structuredContent?.body?.results || [];
    const agency =
      agencyResults.find((item: any) => item?.toptier_agency?.name === "Department of Agriculture") || agencyResults[0];
    assert(agency?.toptier_agency?.name, "awarding agency autocomplete returned no reusable result");

    const agencyTrendResponse = await withTimeout(
      client.callTool({
        name: "usaspending.v2__search__spending_over_time",
        arguments: {
          group: "fiscal_year",
          filters: {
            agencies: [{ type: "awarding", tier: "toptier", name: agency.toptier_agency.name }],
            time_period: [{ start_date: "2021-10-01", end_date: "2025-09-30" }],
          },
          spending_level: "transactions",
        },
      }),
      timeoutMs,
      `timeout calling agency trend; stderr=${serverStderr}`
    );
    const agencyTrend = (agencyTrendResponse as any)?.structuredContent;
    assert(
      Array.isArray(agencyTrend?.body?.results) && agencyTrend.body.results.length >= 2,
      "agency trend returned too few time buckets"
    );

    const awardSearchResponse = await withTimeout(
      client.callTool({
        name: "usaspending.v2__search__spending_by_award",
        arguments: {
          filters: {
            recipient_search_text: [recipientSearchValue],
            award_type_codes: ["A", "B", "C"],
            time_period: [{ start_date: "2024-10-01", end_date: "2025-09-30" }],
          },
          fields: ["Award ID", "Recipient Name", "Award Amount"],
          limit: 1,
          page: 1,
          sort: "Award Amount",
          order: "desc",
        },
      }),
      timeoutMs,
      `timeout calling award search; stderr=${serverStderr}`
    );
    const topAward = (awardSearchResponse as any)?.structuredContent?.body?.results?.[0];
    assert(topAward, "award search returned no rows");
    assert(typeof topAward.generated_internal_id === "string" && topAward.generated_internal_id.length > 0, "award search missing generated_internal_id");

    const awardDocResponse = await withTimeout(
      client.callTool({ name: "usaspending.getDoc", arguments: { slug: "v2__search__spending_by_award" } }),
      timeoutMs,
      `timeout calling getDoc for search awards; stderr=${serverStderr}`
    );
    const awardDetailDocResponse = await withTimeout(
      client.callTool({ name: "usaspending.getDoc", arguments: { slug: "v2__awards__award_id" } }),
      timeoutMs,
      `timeout calling getDoc for award detail; stderr=${serverStderr}`
    );
    assert(
      String((awardDocResponse as any)?.structuredContent?.semanticGuide ?? "").includes("generated_internal_id"),
      "search award guide missing generated_internal_id join guidance"
    );
    assert(
      String((awardDetailDocResponse as any)?.structuredContent?.semanticGuide ?? "").includes("generated_internal_id"),
      "award detail guide missing generated_internal_id join guidance"
    );

    const awardDetailResponse = await withTimeout(
      client.callTool({
        name: "usaspending.v2__awards__award_id",
        arguments: { award_id: topAward.generated_internal_id },
      }),
      timeoutMs,
      `timeout calling award detail; stderr=${serverStderr}`
    );
    const awardDetail = (awardDetailResponse as any)?.structuredContent;
    assert(awardDetail?.status === 200, "award detail did not return HTTP 200");
    assert(
      awardDetail?.body?.generated_unique_award_id === topAward.generated_internal_id,
      "award detail payload did not match generated_internal_id"
    );

    console.log(
      JSON.stringify(
        {
          event: "mcp_analyst_scenarios_passed",
          startedAt,
          finishedAt: new Date().toISOString(),
          rawOnlyVerified: true,
          listedToolCount: toolNames.length,
          discoveryChecks,
          trendSummary: {
            points: trendRows.length,
            firstTimePeriod: trendRows[0]?.time_period ?? null,
            lastTimePeriod: trendRows[trendRows.length - 1]?.time_period ?? null,
          },
          trendHealth: {
            slug: health.slug,
            overallStatus: health.overallStatus,
          },
          recipientScenario: {
            lookupValue: recipientSearchValue,
            points: recipientTrend.body.results.length,
          },
          agencyScenario: {
            agencyName: agency.toptier_agency.name,
            points: agencyTrend.body.results.length,
          },
          awardDetailScenario: {
            searchAwardId: topAward["Award ID"] ?? null,
            detailAwardId: topAward.generated_internal_id,
            status: awardDetail.status,
            piid: awardDetail?.body?.piid ?? null,
            generatedUniqueAwardId: awardDetail?.body?.generated_unique_award_id ?? null,
          },
        },
        null,
        2
      )
    );
  } finally {
    try {
      await client.close();
    } catch {
      // best-effort
    }
  }
}

main().catch((err) => {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[MCP_ANALYST_SCENARIOS_FAILED] ${detail}`);
  process.exit(1);
});
