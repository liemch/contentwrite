import { describe, expect, it } from "vitest";
import {
  ARTICLE_PATCH_MARKER,
  applyArticlePatch,
  buildSectionHashMap,
  hashSectionContent,
  parseArticlePatch,
  parseMarkdownSections,
  resolvePatchedOrFullDraft,
} from "@/lib/tfes/section-patch";

const draft = `# Stable title

## Introduction
Stable opening.

## Deep Analysis
Repeated wording that needs a local edit.

## Recommendations
Stable recommendation.

## References
https://example.com/source`;

describe("section-patch engine", () => {
  it("parses markdown sections with stable ids", () => {
    const sections = parseMarkdownSections(draft);
    expect(sections.map((section) => section.id)).toEqual([
      "title",
      "introduction",
      "deep-analysis",
      "recommendations",
      "references",
    ]);
  });

  it("applies replace_section and refuses allowlist violations", () => {
    const hashes = buildSectionHashMap(draft);
    const raw = `${ARTICLE_PATCH_MARKER}
${JSON.stringify({
  contractVersion: "article-patch.v1",
  operations: [
    {
      op: "replace_section",
      sectionId: "deep-analysis",
      expectedHash: hashes["deep-analysis"],
      contentMarkdown: "## Deep Analysis\nFixed once.",
    },
  ],
  preservedSectionIds: ["title", "introduction", "recommendations", "references"],
})}
`;
    const { patch } = parseArticlePatch(raw);
    expect(patch).not.toBeNull();
    const applied = applyArticlePatch({
      baseDocument: draft,
      patch: patch!,
      allowlistSectionIds: ["deep-analysis"],
    });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.document).toContain("Fixed once.");
      expect(applied.document).toContain("Stable opening.");
      expect(applied.sectionsTouched).toEqual(["deep-analysis"]);
    }

    const blocked = applyArticlePatch({
      baseDocument: draft,
      patch: {
        contractVersion: "article-patch.v1",
        operations: [
          {
            op: "replace_section",
            sectionId: "recommendations",
            contentMarkdown: "## Recommendations\nHacked",
          },
        ],
      },
      allowlistSectionIds: ["deep-analysis"],
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("outside-allowlist");
  });

  it("rejects hash mismatch and preserve conflicts", () => {
    const mismatch = applyArticlePatch({
      baseDocument: draft,
      patch: {
        contractVersion: "article-patch.v1",
        operations: [
          {
            op: "replace_section",
            sectionId: "deep-analysis",
            expectedHash: "sha256:deadbeef",
            contentMarkdown: "## Deep Analysis\nX",
          },
        ],
      },
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.reason).toBe("hash-mismatch");

    const preserve = applyArticlePatch({
      baseDocument: draft,
      patch: {
        contractVersion: "article-patch.v1",
        operations: [
          {
            op: "replace_section",
            sectionId: "introduction",
            contentMarkdown: "## Introduction\nChanged",
          },
        ],
        preservedSectionIds: ["introduction"],
      },
    });
    expect(preserve.ok).toBe(false);
    if (!preserve.ok) expect(preserve.reason).toBe("preserve-conflict");
  });

  it("falls back to full draft when patch is absent or disabled", () => {
    const disabled = resolvePatchedOrFullDraft({
      baseDocument: draft,
      rawOutput: "# Full\n\n## A\nbody",
      enabled: false,
    });
    expect(disabled.usedPatch).toBe(false);
    expect(disabled.document).toContain("# Full");

    const hashes = buildSectionHashMap(draft);
    const patched = resolvePatchedOrFullDraft({
      baseDocument: draft,
      rawOutput: `${ARTICLE_PATCH_MARKER}
${JSON.stringify({
  contractVersion: "article-patch.v1",
  operations: [
    {
      op: "replace_section",
      sectionId: "deep-analysis",
      expectedHash: hashes["deep-analysis"],
      contentMarkdown: "## Deep Analysis\nPatched",
    },
  ],
})}
`,
      enabled: true,
      allowlistSectionIds: ["deep-analysis"],
    });
    expect(patched.usedPatch).toBe(true);
    expect(patched.document).toContain("Patched");
    expect(hashSectionContent("## Deep Analysis\nPatched")).toMatch(/^sha256:/);
  });
});
