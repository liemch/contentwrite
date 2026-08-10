import { describe, expect, it } from "vitest";
import {
  clipDomainProfileForRole,
  resolveAndValidateDomainProfile,
} from "@/lib/tfes/domain-profile";
import { readTfesFile } from "@/lib/tfes/prompts";

describe("domain profile merge", () => {
  it("soft-skills overrides engineering source_tiers and keeps blocklist", () => {
    const { content } = resolveAndValidateDomainProfile("soft-skills", readTfesFile);
    expect(content).toContain("## source_tiers");
    expect(content).toContain("Harvard Business Review");
    expect(content).not.toMatch(
      /## source_tiers\n[\s\S]*OpenAI\/Anthropic/,
    );
    expect(content).toContain("## pseudoscience_blocklist");
    expect(content).toContain("MBTI");
    expect(content).toContain("## sensitivity");
    expect(content).toContain("Không chẩn đoán tâm lý");
  });

  it("accepts annotated section headers by stripping parenthetical notes", () => {
    const fake = (path: string) => {
      if (path.endsWith("engineering.md")) {
        return [
          "## profile_version",
          "1.6",
          "## identity",
          "base",
          "## audience",
          "eng",
          "## tone",
          "dry",
          "## source_tiers",
          "Tier 1 eng",
          "## example_strategy",
          "case",
          "## categories",
          "A",
          "## scoring_weights",
          "A 20 · B 20 · C 20 · D 20 · E 20",
          "## sensitivity",
          "base sensitivity",
          "## freshness",
          "30d",
          "## seed_topics",
          "topic",
          "## gold_samples",
          "### Sample A\nx",
          "### Sample B\ny",
        ].join("\n\n");
      }
      return [
        "## profile_version",
        "1.6",
        "## source_tiers (KHÁC)",
        "Tier 1 soft",
        "## sensitivity (BẮT BUỘC)",
        "soft sensitivity",
        "## scoring_weights",
        "A 25 · B 25 · C 25 · D 25",
        "## gold_samples",
        "### Sample A\nsoft a",
        "### Sample B\nsoft b",
        "## identity",
        "soft id",
        "## audience",
        "soft aud",
        "## tone",
        "soft tone",
        "## example_strategy",
        "soft ex",
        "## categories",
        "soft cat",
        "## seed_topics",
        "soft seed",
        "## freshness",
        "60d",
      ].join("\n\n");
    };
    const { content } = resolveAndValidateDomainProfile("soft-skills", fake);
    expect(content).toContain("Tier 1 soft");
    expect(content).toContain("soft sensitivity");
    expect(content).not.toContain("Tier 1 eng");
  });

  it("role clip prefers guardrail sections over gold_samples tail", () => {
    const { content } = resolveAndValidateDomainProfile("soft-skills", readTfesFile);
    const clipped = clipDomainProfileForRole(content, 2_400);
    expect(clipped).toContain("## source_tiers");
    expect(clipped).toContain("## pseudoscience_blocklist");
    expect(clipped).toContain("## sensitivity");
    expect(clipped.indexOf("## gold_samples")).toBe(-1);
  });

  it("resolves and validates all registered domains including fun/new-tech/lifestyle", async () => {
    const { DOMAIN_IDS } = await import("@/lib/tfes/domains");
    for (const id of DOMAIN_IDS) {
      const { content, version } = resolveAndValidateDomainProfile(id, readTfesFile);
      expect(content).toContain(`# Resolved Domain Profile: ${id}`);
      expect(version).toBeTruthy();
      expect(content).toContain("## gold_samples");
      expect(content).toContain("## scoring_weights");
    }
  });
});