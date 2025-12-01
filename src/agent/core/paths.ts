import { join } from "path";

export function slugFromContract(contractPath: string) {
  return contractPath.replace(/^staging\/docs\//, "").replace(/\.md$/, "").replace(/\//g, "__");
}

export function runDirs(repoRoot: string, version: string, slug: string, stage: "discover" | "validate" | "final") {
  const base = join(repoRoot, "runs", version, slug, stage === "final" ? "final" : stage);
  return base;
}

export function filesForStage(repoRoot: string, version: string, slug: string, stage: "discover" | "validate" | "final") {
  const dir = runDirs(repoRoot, version, slug, stage);
  const summary = stage === "final" ? join(dir, "profile.json") : join(dir, "summary.json");
  const promptTxt = join(dir, "prompt.txt");
  const responseTxt = join(dir, "response.txt");
  return { dir, summary, promptTxt, responseTxt };
}

