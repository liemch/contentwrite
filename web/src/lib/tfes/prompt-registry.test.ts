import { describe, expect, it } from "vitest";
import {
  buildPromptExecutionTelemetry,
  parseMarkedPromptJson,
  resolvePromptDescriptor,
} from "@/lib/tfes/prompt-registry";

describe("Prompt Registry runtime", () => {
  it("falls back to v1.6 while prompt architecture is disabled", () => {
    expect(
      resolvePromptDescriptor("editorial-diagnosis", {
        enabled: false,
        requestedVersion: "2.0",
      }),
    ).toMatchObject({
      promptVersion: "1.6",
      contractVersion: "editorial-review-canonical",
      fallbackReason: "disabled",
    });
  });

  it("selects each v2 prompt independently from the minimal registry", () => {
    expect(
      resolvePromptDescriptor("minor-remediation", {
        enabled: true,
        requestedVersion: "2.0",
      }),
    ).toMatchObject({
      promptId: "minor-remediation",
      promptVersion: "2.0",
      contractVersion: "full-draft-preserve.v2",
      role: "PATCH",
    });
  });

  it("fails safe to v1.6 for an unknown requested version", () => {
    expect(
      resolvePromptDescriptor("lock-verifier", {
        enabled: true,
        requestedVersion: "2.1-unknown",
      }),
    ).toMatchObject({
      promptVersion: "1.6",
      fallbackReason: "unknown-version",
    });
  });

  it("reports context and token estimates without prompt/article content", () => {
    const descriptor = resolvePromptDescriptor("minor-remediation", {
      enabled: true,
      requestedVersion: "2.0",
    });
    expect(
      buildPromptExecutionTelemetry({
        descriptor,
        contextCharacterLength: 8_000,
        legacyContextCharacterLength: 20_000,
        defectCount: 2,
        remediationMedium: "full-draft-preserve",
      }),
    ).toMatchObject({
      promptVersion: "2.0",
      contextCharacterLength: 8_000,
      contextReductionCharacters: 12_000,
      contextReductionRatio: 0.6,
      inputTokenEstimate: 2_000,
      remediationMedium: "full-draft-preserve",
    });
  });

  it("parses only explicitly marked JSON and ignores prose enums", () => {
    expect(
      parseMarkedPromptJson(
        'LOCK_DECISION_JSON:\n```json\n{"lockDecision":"LOCKED"}\n```',
        "LOCK_DECISION_JSON:",
      ),
    ).toEqual({ lockDecision: "LOCKED" });
    expect(
      parseMarkedPromptJson(
        "The possible lock decision is LOCKED.",
        "LOCK_DECISION_JSON:",
      ),
    ).toBeNull();
  });
});

