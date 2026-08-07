import { describe, expect, it } from "vitest";
import {
  minorPreserveInstructions,
  parseMinorPreserveOutput,
} from "@/lib/tfes/minor-preserve-prompt";

describe("WP-V2-04 MINOR Preserve Prompt", () => {
  it("adds preservation constraints only to enabled MINOR remediation", () => {
    const prompt = minorPreserveInstructions({
      enabled: true,
      revisionSeverity: "MINOR_REVISION_REQUIRED",
      version: "v2-rc1-minor-preserve-v1",
    });
    expect(prompt).toContain("Preserve the title");
    expect(prompt).toContain("Preserve outline and section ordering");
    expect(prompt).toContain("Preserve the main insight/thesis");
    expect(prompt).toContain("Do not globally restyle");
    expect(prompt).toContain("minimum failing surface");
    expect(prompt).toContain("UNCHANGED_SECTIONS:");
    expect(prompt).toContain("CHANGED_SECTIONS:");
  });

  it.each(["MAJOR_REVISION_REQUIRED", "REWRITE_REQUIRED"])(
    "does not inject MINOR constraints into %s",
    (revisionSeverity) => {
      expect(
        minorPreserveInstructions({
          enabled: true,
          revisionSeverity,
          version: "v2-rc1-minor-preserve-v1",
        }),
      ).toBe("");
    },
  );

  it("is independently disabled", () => {
    expect(
      minorPreserveInstructions({
        enabled: false,
        revisionSeverity: "MINOR_REVISION_REQUIRED",
        version: "v2-rc1-minor-preserve-v1",
      }),
    ).toBe("");
  });

  it("strips and parses best-effort metadata from a full draft", () => {
    expect(
      parseMinorPreserveOutput(
        "# Title\n\n## A\nKept\n\n## B\nChanged\n\nUNCHANGED_SECTIONS: A, C\nCHANGED_SECTIONS: B",
      ),
    ).toEqual({
      draft: "# Title\n\n## A\nKept\n\n## B\nChanged",
      unchangedSections: ["A", "C"],
      changedSections: ["B"],
      metadataReadable: true,
    });
  });

  it("keeps legacy full-draft output compatible when metadata is absent", () => {
    const legacy = "# Title\n\n## A\nLegacy response";
    expect(parseMinorPreserveOutput(legacy)).toEqual({
      draft: legacy,
      unchangedSections: [],
      changedSections: [],
      metadataReadable: false,
    });
  });
});
