export type MinorPreserveParse = {
  draft: string;
  changedSections: string[];
  unchangedSections: string[];
  metadataReadable: boolean;
};

export function minorPreserveInstructions(input: {
  enabled: boolean;
  revisionSeverity: string;
  version: string;
}): string {
  if (!input.enabled || input.revisionSeverity !== "MINOR_REVISION_REQUIRED") {
    return "";
  }
  return [
    `## MINOR PRESERVE CONTRACT (${input.version})`,
    "This is a constrained full-draft MINOR revision, not a global rewrite.",
    "- Preserve the title unless Required Revisions explicitly names the title.",
    "- Preserve outline and section ordering unless explicitly required to change them.",
    "- Preserve the main insight/thesis and every unrelated section.",
    "- Do not globally restyle and do not introduce new claims unless required.",
    "- Modify the minimum failing surface only.",
    "Keep the existing full Article.md output contract.",
    "After the complete draft, append exactly two best-effort metadata lines:",
    "UNCHANGED_SECTIONS: <comma-separated section headings>",
    "CHANGED_SECTIONS: <comma-separated section headings>",
    "Metadata helps telemetry only; the article must remain complete without it.",
  ].join("\n");
}

function metadataValues(raw: string, label: string): string[] {
  const match = raw.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "im"));
  if (!match) return [];
  return match[1]
    .replace(/^\[|\]$/g, "")
    .split(/[,|]/)
    .map((value) => value.trim())
    .filter((value) => value && !/^(none|n\/a|unknown)$/i.test(value));
}

/** Legacy full-draft responses remain valid; metadata is telemetry-only. */
export function parseMinorPreserveOutput(raw: string): MinorPreserveParse {
  const hasUnchanged = /^UNCHANGED_SECTIONS\s*:/im.test(raw);
  const hasChanged = /^CHANGED_SECTIONS\s*:/im.test(raw);
  return {
    draft: raw
      .replace(/^UNCHANGED_SECTIONS\s*:.*(?:\r?\n|$)/gim, "")
      .replace(/^CHANGED_SECTIONS\s*:.*(?:\r?\n|$)/gim, "")
      .trim(),
    unchangedSections: metadataValues(raw, "UNCHANGED_SECTIONS"),
    changedSections: metadataValues(raw, "CHANGED_SECTIONS"),
    metadataReadable: hasUnchanged && hasChanged,
  };
}
