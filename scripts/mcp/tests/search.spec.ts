import { describe, expect, it } from "vitest";
import { scoreSearchQuery, searchTokens } from "../src/search.js";

describe("search helpers", () => {
  it("tokenizes camelCase, separators, and plural variants", () => {
    const tokens = searchTokens("usaspending.v2__search__spending_over_time search_awards");
    expect(tokens).toContain("spending");
    expect(tokens).toContain("awards");
    expect(tokens).toContain("award");
    expect(tokens).toContain("search");
    expect(tokens).toContain("time");
  });

  it("matches natural-language trend queries against representative metadata", () => {
    const score = scoreSearchQuery("investigate spending trends over time", [
      "v2__search__spending_over_time",
      "Aggregates spending over time into fiscal-year, calendar-year, quarter, or month buckets for a filtered search scope.",
      "trends",
      "time_series",
      "spending_trend",
      "usaspending.v2__search__spending_over_time",
    ]);
    expect(score).toBeGreaterThan(0);
  });

  it("matches singular queries against plural metadata", () => {
    const score = scoreSearchQuery("award detail", [
      "v2__awards__award_id",
      "awards",
      "detail",
      "usaspending.v2__awards__award_id",
    ]);
    expect(score).toBeGreaterThan(0);
  });

  it("returns zero when there is no overlap", () => {
    const score = scoreSearchQuery("weather forecast", [
      "v2__search__spending_over_time",
      "trends",
      "time_series",
      "spending_trend",
    ]);
    expect(score).toBe(0);
  });
});
