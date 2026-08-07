import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("WP-V2-01 convergence telemetry wiring", () => {
  it("observes Editorial, rewrite and Final paths without controlling decisions", () => {
    const workflow = source("src/lib/tfes/workflow.ts");
    expect(workflow).toContain("convergenceContextForRun");
    expect(workflow).toContain('observation: "editorial"');
    expect(workflow).toContain('observation: "rewrite"');
    expect(workflow).toContain('observation: "final"');
    expect(workflow).toContain("convergence: finalConvergence");

    const helper = source("src/lib/tfes/convergence-telemetry.ts");
    expect(helper).toContain("Pure WP-V2-01 observation builder");
    expect(helper).not.toContain("WorkflowState");
    expect(helper).not.toContain("transitionArticle");
    expect(helper).not.toContain("chatCompletion");
  });

  it("keeps the convergence payload additive and backward compatible", () => {
    const telemetry = source("src/lib/tfes/remediation-telemetry.ts");
    expect(telemetry).toContain("convergence?: ConvergenceTelemetry");
    expect(telemetry).toContain(
      "...(input.convergence ? { convergence: input.convergence } : {})",
    );
    const metrics = source("scripts/lib/remediation-metrics.mjs");
    expect(metrics).toContain("editorialScoreMonotonicityRate");
    expect(metrics).toContain("candidateRegressionRate");
    expect(metrics).toContain("finalRegressionRate");
    expect(metrics).toContain("retryConvergenceRate");
    expect(metrics).toContain("averageRewriteCountPerArticle");
  });
});
