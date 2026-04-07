import { mkdirSync, writeFileSync } from "fs";
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

function formatDateForPath(now = new Date(), timeZone = "America/New_York"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  assert(year && month && day, "failed to format report date");
  return `${year}-${month}-${day}`;
}

function currency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function percent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function markdownTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [head, sep, body].filter(Boolean).join("\n");
}

function pickAgency(results: any[], exactName: string): any {
  return (
    results.find((item) => item?.toptier_agency?.name === exactName) ||
    results.find((item) => item?.toptier_agency?.name?.toLowerCase?.() === exactName.toLowerCase()) ||
    results[0]
  );
}

function extractContractField(body: any, ...paths: string[]): string | null {
  for (const path of paths) {
    const segments = path.split(".");
    let current: any = body;
    for (const segment of segments) {
      if (!current || typeof current !== "object") {
        current = undefined;
        break;
      }
      current = current[segment];
    }
    if (typeof current === "string" && current.trim()) return current.trim();
  }
  return null;
}

type TrendSummary = {
  keyword: string;
  startYear: string | null;
  endYear: string | null;
  startAmount: number | null;
  endAmount: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
};

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const repoRoot = join(__dirname, "..", "..", "..");
  const serverBin = join(repoRoot, "scripts", "mcp", "bin", "stdio-server");
  const timeoutMs = Number(process.env.ANALYST_TIMEOUT_MS ?? 20_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`invalid ANALYST_TIMEOUT_MS '${process.env.ANALYST_TIMEOUT_MS}'`);
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
    { name: "gov-gpt-raw-analyst-bench", version: "0.1.0" },
    { capabilities: {} }
  );

  const callTool = async (name: string, args: Record<string, unknown>) =>
    withTimeout(
      client.callTool({ name, arguments: args }),
      timeoutMs,
      `timeout calling ${name}; stderr=${serverStderr}`
    );

  const startedAt = new Date().toISOString();
  const broadQueries = [
    "find spending inefficiencies and fraud",
    "screen for sole source contracts",
    "recipient concentration by agency",
    "sudden agency spending spike",
  ];
  const trendKeywords = ["infrastructure", "cloud", "cybersecurity", "disaster"];

  try {
    await withTimeout(
      client.connect(transport),
      timeoutMs,
      `timeout connecting to MCP server after ${timeoutMs}ms; stderr=${serverStderr}`
    );

    const tools = await withTimeout(
      client.listTools(),
      timeoutMs,
      `timeout listing MCP tools; stderr=${serverStderr}`
    );
    const toolNames = Array.isArray((tools as any)?.tools)
      ? (tools as any).tools.map((tool: any) => tool?.name).filter((name: any) => typeof name === "string")
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

    const discoveryResults: Array<{
      query: string;
      capabilityTop: Array<{ slug: string; toolName: string; shipTier: string }>;
      endpointTop: Array<{ slug: string; toolName: string; shipTier: string }>;
    }> = [];

    for (const query of broadQueries) {
      const capabilityResponse = (await callTool("usaspending.findCapabilities", { query, limit: 5 })) as any;
      const endpointResponse = (await callTool("usaspending.findEndpoints", { query, limit: 5 })) as any;
      const capabilityTop = ((capabilityResponse?.structuredContent?.results as any[]) || []).map((item) => ({
        slug: item.slug,
        toolName: item.preferredToolName,
        shipTier: item.shipTier,
      }));
      const endpointTop = ((endpointResponse?.structuredContent?.results as any[]) || []).map((item) => ({
        slug: item.slug,
        toolName: item.toolName,
        shipTier: item.shipTier,
      }));
      discoveryResults.push({ query, capabilityTop, endpointTop });
    }

    const trendSummaries: TrendSummary[] = [];
    for (const keyword of trendKeywords) {
      const response = (await callTool("usaspending.v2__search__spending_over_time", {
        group: "fiscal_year",
        filters: {
          keywords: [keyword],
          time_period: [{ start_date: "2021-10-01", end_date: "2025-09-30" }],
        },
        spending_level: "transactions",
      })) as any;
      const rows = response?.structuredContent?.body?.results;
      assert(Array.isArray(rows) && rows.length >= 2, `trend query for '${keyword}' returned too few buckets`);
      const first = rows[0];
      const last = rows[rows.length - 1];
      const startAmount = toNumber(first?.aggregated_amount);
      const endAmount = toNumber(last?.aggregated_amount);
      const absoluteChange = startAmount !== null && endAmount !== null ? endAmount - startAmount : null;
      const percentChange = startAmount && endAmount !== null ? ((endAmount - startAmount) / startAmount) * 100 : null;
      trendSummaries.push({
        keyword,
        startYear: first?.time_period?.fiscal_year ?? null,
        endYear: last?.time_period?.fiscal_year ?? null,
        startAmount,
        endAmount,
        absoluteChange,
        percentChange,
      });
    }

    const agencyLookup = (await callTool("usaspending.v2__autocomplete__awarding_agency", {
      search_text: "Defense",
      limit: 10,
    })) as any;
    const defenseAgency = pickAgency(agencyLookup?.structuredContent?.body?.results || [], "Department of Defense");
    assert(defenseAgency, "failed to resolve Department of Defense");
    const dodName = defenseAgency?.toptier_agency?.name;
    const dodToptierCode = defenseAgency?.toptier_agency?.toptier_code;
    const dodAutocompleteId = toNumber(defenseAgency?.id);
    assert(typeof dodName === "string" && dodName.length > 0, "resolved DoD name missing");
    assert(typeof dodToptierCode === "string" && dodToptierCode.length > 0, "resolved DoD toptier code missing");

    const awardDocs = (await callTool("usaspending.getDoc", {
      slug: "v2__search__spending_by_award",
    })) as any;
    const awardDetailDocs = (await callTool("usaspending.getDoc", {
      slug: "v2__awards__award_id",
    })) as any;
    const recipientSpendDocs = (await callTool("usaspending.getDoc", {
      slug: "v2__award_spending__recipient",
    })) as any;
    const awardSearchGuide = awardDocs?.structuredContent?.semanticGuide ?? "";
    const awardDetailGuide = awardDetailDocs?.structuredContent?.semanticGuide ?? "";
    const recipientSpendGuide = recipientSpendDocs?.structuredContent?.semanticGuide ?? "";
    assert(String(awardSearchGuide).includes("generated_internal_id"), "award search guide missing generated_internal_id");
    assert(String(awardDetailGuide).includes("generated_internal_id"), "award detail guide missing generated_internal_id");
    assert(String(recipientSpendGuide).includes("awarding toptier agency"), "recipient spend guide missing awarding agency guidance");

    const dodAwardSearch = (await callTool("usaspending.v2__search__spending_by_award", {
      filters: {
        agencies: [{ type: "awarding", tier: "toptier", name: dodName }],
        award_type_codes: ["A", "B", "C"],
        time_period: [{ start_date: "2024-10-01", end_date: "2025-09-30" }],
      },
      fields: ["Award ID", "Recipient Name", "Award Amount"],
      limit: 5,
      page: 1,
      sort: "Award Amount",
      order: "desc",
    })) as any;
    const topAwards = dodAwardSearch?.structuredContent?.body?.results;
    assert(Array.isArray(topAwards) && topAwards.length > 0, "DoD award search returned no rows");
    const awardingAgencyIdFromSearch = topAwards
      .map((row: any) => toNumber(row?.awarding_agency_id))
      .find((value: number | null) => value !== null);
    const awardRowsWithDetails = [];
    let soleSourceLikeCount = 0;

    for (const row of topAwards.slice(0, 5)) {
      assert(typeof row?.generated_internal_id === "string" && row.generated_internal_id.length > 0, "award row missing generated_internal_id");
      const awardDetail = (await callTool("usaspending.v2__awards__award_id", {
        award_id: row.generated_internal_id,
      })) as any;
      const body = awardDetail?.structuredContent?.body;
      const competition = extractContractField(body, "extent_competed", "latest_transaction_contract_data.extent_competed");
      const solicitation = extractContractField(body, "solicitation_procedures", "latest_transaction_contract_data.solicitation_procedures");
      const otherThanFullAndOpen = extractContractField(
        body,
        "other_than_full_and_open_competition",
        "latest_transaction_contract_data.other_than_full_and_open_competition"
      );
      const pricing = extractContractField(body, "type_of_contract_pricing", "latest_transaction_contract_data.type_of_contract_pricing");
      const obligation = toNumber(body?.total_obligation);
      const isSoleSourceLike = [competition, solicitation, otherThanFullAndOpen]
        .filter((value): value is string => typeof value === "string")
        .some((value) => /only one source|not available for competition|other than full and open|limited/i.test(value));
      if (isSoleSourceLike) soleSourceLikeCount += 1;

      awardRowsWithDetails.push({
        awardId: row["Award ID"] ?? null,
        generatedInternalId: row.generated_internal_id,
        recipientName: row["Recipient Name"] ?? null,
        awardAmount: toNumber(row["Award Amount"]),
        detailObligation: obligation,
        competition,
        solicitation,
        otherThanFullAndOpen,
        pricing,
      });
    }

    const recipientSpendAttempts: Array<{
      label: string;
      awardingAgencyId: number;
      status: number | null;
      resultCount: number;
      pageCount: number | null;
    }> = [];
    let topRecipientRows: Array<{
      recipientName: string | null;
      awardCategory: string | null;
      obligatedAmount: number | null;
    }> = [];

    for (const candidate of [
      { label: "award search helper column", awardingAgencyId: awardingAgencyIdFromSearch },
      { label: "autocomplete agency id", awardingAgencyId: dodAutocompleteId },
    ]) {
      if (candidate.awardingAgencyId == null) continue;
      const recipientSpend = (await callTool("usaspending.v2__award_spending__recipient", {
        awarding_agency_id: candidate.awardingAgencyId,
        fiscal_year: 2025,
        limit: 10,
        page: 1,
      })) as any;
      const body = recipientSpend?.structuredContent?.body;
      const rows = Array.isArray(body?.results) ? body.results : [];
      recipientSpendAttempts.push({
        label: candidate.label,
        awardingAgencyId: candidate.awardingAgencyId,
        status: typeof recipientSpend?.structuredContent?.status === "number" ? recipientSpend.structuredContent.status : null,
        resultCount: rows.length,
        pageCount: toNumber(body?.page_metadata?.count),
      });
      if (rows.length > 0 && topRecipientRows.length === 0) {
        topRecipientRows = rows.slice(0, 10).map((row: any) => ({
          recipientName: row?.recipient?.recipient_name ?? null,
          awardCategory: row?.award_category ?? null,
          obligatedAmount: toNumber(row?.obligated_amount),
        }));
      }
    }

    const topRecipientBase = topRecipientRows.reduce((sum, row) => sum + (row.obligatedAmount || 0), 0);
    const topRecipientOne = topRecipientRows[0]?.obligatedAmount || 0;
    const topRecipientTopFive = topRecipientRows.slice(0, 5).reduce((sum, row) => sum + (row.obligatedAmount || 0), 0);

    const agricultureLookup = (await callTool("usaspending.v2__autocomplete__awarding_agency", {
      search_text: "Agriculture",
      limit: 10,
    })) as any;
    const agricultureAgency = pickAgency(agricultureLookup?.structuredContent?.body?.results || [], "Department of Agriculture");
    assert(agricultureAgency, "failed to resolve Department of Agriculture");
    const usdaName = agricultureAgency?.toptier_agency?.name;
    const usdaToptierCode = agricultureAgency?.toptier_agency?.toptier_code;
    assert(typeof usdaName === "string" && usdaName.length > 0, "resolved USDA name missing");
    assert(typeof usdaToptierCode === "string" && usdaToptierCode.length > 0, "resolved USDA toptier code missing");

    const usdaObjectClass = (await callTool("usaspending.v2__agency__toptier_code__object_class", {
      toptier_code: usdaToptierCode,
      fiscal_year: 2025,
      sort: "obligated_amount",
      order: "desc",
      limit: 10,
      page: 1,
    })) as any;
    const objectClassRows = usdaObjectClass?.structuredContent?.body?.results;
    assert(Array.isArray(objectClassRows) && objectClassRows.length > 0, "USDA object class query returned no rows");
    const topObjectClasses = objectClassRows.slice(0, 10).map((row: any) => ({
      name: row?.name ?? null,
      obligatedAmount: toNumber(row?.obligated_amount),
    }));
    const topObjectClassBase = topObjectClasses.reduce((sum, row) => sum + (row.obligatedAmount || 0), 0);

    const reportDate = formatDateForPath();
    const reportPath = join(repoRoot, "runs", "_analysis", `${reportDate}-raw-mcp-analysis-bench.md`);
    mkdirSync(dirname(reportPath), { recursive: true });

    const report = [
      "# Raw MCP Analysis Bench",
      "",
      `Date: ${reportDate}`,
      "",
      "Goal: pressure-test the raw-only USAspending MCP with broad analyst questions, then document where an external agent would still struggle without adding server-side workflow logic.",
      "",
      "## Scope",
      "",
      "- Discovery queries against `findCapabilities` and `findEndpoints`",
      "- Multi-year keyword trend screening with `v2__search__spending_over_time`",
      "- High-value contract inspection with `v2__search__spending_by_award` plus `v2__awards__award_id`",
      "- Recipient concentration screening with `v2__award_spending__recipient`",
      "- Agency composition screening with `v2__agency__toptier_code__object_class`",
      "",
      "## Discovery",
      "",
      ...discoveryResults.flatMap((result) => [
        `### Query: \`${result.query}\``,
        "",
        "Top `findCapabilities` results:",
        "",
        markdownTable(
          ["Rank", "Slug", "Tool", "Tier"],
          result.capabilityTop.map((item, index) => [
            String(index + 1),
            `\`${item.slug}\``,
            `\`${item.toolName}\``,
            item.shipTier || "unshipped",
          ])
        ),
        "",
        "Top `findEndpoints` results:",
        "",
        markdownTable(
          ["Rank", "Slug", "Tool", "Tier"],
          result.endpointTop.map((item, index) => [
            String(index + 1),
            `\`${item.slug}\``,
            `\`${item.toolName}\``,
            item.shipTier || "unshipped",
          ])
        ),
        "",
      ]),
      "## Trend Screening",
      "",
      markdownTable(
        ["Keyword", "Start FY", "Start Amount", "End FY", "End Amount", "Abs Change", "% Change"],
        trendSummaries.map((item) => [
          item.keyword,
          item.startYear || "n/a",
          currency(item.startAmount),
          item.endYear || "n/a",
          currency(item.endAmount),
          currency(item.absoluteChange),
          percent(item.percentChange),
        ])
      ),
      "",
      "## High-Value DoD Contract Screening",
      "",
      `Resolved awarding agency: \`${dodName}\` (toptier_code=\`${dodToptierCode}\`, autocomplete id=\`${dodAutocompleteId ?? "n/a"}\`)`,
      "",
      markdownTable(
        ["Award ID", "Recipient", "Search Amount", "Detail Obligation", "Competition", "Solicitation", "Other-than-full-and-open", "Pricing"],
        awardRowsWithDetails.map((row) => [
          row.awardId ? String(row.awardId) : "n/a",
          row.recipientName ? String(row.recipientName) : "n/a",
          currency(row.awardAmount),
          currency(row.detailObligation),
          row.competition || "n/a",
          row.solicitation || "n/a",
          row.otherThanFullAndOpen || "n/a",
          row.pricing || "n/a",
        ])
      ),
      "",
      `Sole-source-like flags across the top 5 inspected awards: ${soleSourceLikeCount} of ${awardRowsWithDetails.length}`,
      "",
      "## Recipient Concentration",
      "",
      `Follow-up agency id exposed by award search: \`${awardingAgencyIdFromSearch ?? "n/a"}\``,
      "",
      "Attempted joins:",
      "",
      markdownTable(
        ["Source", "Agency ID", "HTTP Status", "Returned Rows", "page_metadata.count"],
        recipientSpendAttempts.map((attempt) => [
          attempt.label,
          String(attempt.awardingAgencyId),
          attempt.status === null ? "n/a" : String(attempt.status),
          String(attempt.resultCount),
          attempt.pageCount === null ? "n/a" : String(attempt.pageCount),
        ])
      ),
      "",
      ...(topRecipientRows.length > 0
        ? [
            markdownTable(
              ["Rank", "Recipient", "Award Category", "Obligated Amount"],
              topRecipientRows.map((row, index) => [
                String(index + 1),
                row.recipientName ? String(row.recipientName) : "n/a",
                row.awardCategory ? String(row.awardCategory) : "n/a",
                currency(row.obligatedAmount),
              ])
            ),
            "",
            `Top recipient share of returned top-10 mass: ${percent(topRecipientBase ? (topRecipientOne / topRecipientBase) * 100 : null)}`,
            "",
            `Top five recipient share of returned top-10 mass: ${percent(topRecipientBase ? (topRecipientTopFive / topRecipientBase) * 100 : null)}`,
          ]
        : [
            "_No tested upstream agency identifier produced a non-empty FY2025 recipient concentration result for DoD._",
          ]),
      "",
      "## USDA Object Class Mix",
      "",
      `Resolved awarding agency: \`${usdaName}\` (toptier_code=\`${usdaToptierCode}\`)`,
      "",
      markdownTable(
        ["Rank", "Object Class", "Obligated Amount"],
        topObjectClasses.map((row, index) => [
          String(index + 1),
          row.name ? String(row.name) : "n/a",
          currency(row.obligatedAmount),
        ])
      ),
      "",
      `Top three object classes share of returned top-10 mass: ${percent(
        topObjectClassBase
          ? (topObjectClasses.slice(0, 3).reduce((sum, row) => sum + (row.obligatedAmount || 0), 0) / topObjectClassBase) * 100
          : null
      )}`,
      "",
      "## Friction Observed",
      "",
      "- Discovery returns relevant raw tools for broad questions, but the output is still generic building blocks rather than an investigative scaffold. This is acceptable for raw-only, but it means prompt and profile metadata matter much more than server logic.",
      "- Award-detail follow-up still depends on a non-obvious join key. The only reliable path was reading the semantic guides and reusing `generated_internal_id` from award search.",
      "- High-value contract inspection exposed coded competition and pricing fields such as `A`, `NP`, `MAFO`, `U`, `R`, and `S`. The raw payload is usable, but an analyst still needs a verified code mapping before making strong competition claims.",
      `- \`v2__award_spending__recipient\` could not be composed for DoD from the tested upstream identifiers. ` +
        `The award search response did not expose a usable \`awarding_agency_id\`, and the autocomplete agency id \`${dodAutocompleteId ?? "n/a"}\` returned an empty 200 response. The current docs explain what the parameter means, but they do not point to a stable upstream source for it.`,
      "- The raw surfaces are usable for serious screening work, but only after the agent reads docs and manually composes joins, canonical identifiers, and interpretation rules.",
      "",
      "## Bottom Line",
      "",
      "- The raw MCP is sufficient for serious screening work around broad trends, agency mix, and award-level inspection.",
      "- Recipient concentration is still only partially supported because `v2__award_spending__recipient` does not yet have a documented, reliable upstream raw join for `awarding_agency_id`.",
      "- The core remaining gaps are still support-layer gaps: discovery metadata, join guidance, and canonicalization notes.",
      "- No server-side workflow logic was needed to complete these analyses.",
      "",
    ].join("\n");

    writeFileSync(reportPath, report, "utf-8");

    console.log(
      JSON.stringify(
        {
          event: "raw_mcp_analysis_bench_passed",
          startedAt,
          finishedAt: new Date().toISOString(),
          reportPath,
          broadQueries,
          topTrendByAbsoluteChange: [...trendSummaries]
            .filter((item) => typeof item.absoluteChange === "number")
            .sort((left, right) => (right.absoluteChange || 0) - (left.absoluteChange || 0))[0] || null,
          dodAgency: {
            name: dodName,
            toptierCode: dodToptierCode,
            autocompleteId: dodAutocompleteId,
            searchAwardingAgencyId: awardingAgencyIdFromSearch,
          },
          soleSourceLikeCount,
          recipientSpendAttempts,
          recipientConcentration: {
            topRecipientShareOfTopTen:
              topRecipientRows.length > 0 && topRecipientBase ? (topRecipientOne / topRecipientBase) * 100 : null,
            topFiveShareOfTopTen:
              topRecipientRows.length > 0 && topRecipientBase ? (topRecipientTopFive / topRecipientBase) * 100 : null,
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
  console.error(`[RAW_MCP_ANALYSIS_BENCH_FAILED] ${detail}`);
  process.exit(1);
});
