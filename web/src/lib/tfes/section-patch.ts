import { createHash } from "node:crypto";
import { extractMarkedJson } from "@/lib/tfes/machine-contract";

export const ARTICLE_PATCH_MARKER = "ARTICLE_PATCH_JSON:";
export const CLAIM_PATCH_MARKER = "CLAIM_PATCH_JSON:";

export type MarkdownSection = {
  id: string;
  heading: string;
  level: number;
  content: string;
  /** Inclusive start index in the source document. */
  start: number;
  /** Exclusive end index in the source document. */
  end: number;
};

export type ArticlePatchOp =
  | {
      op: "replace_section";
      sectionId: string;
      expectedHash?: string;
      contentMarkdown: string;
    }
  | {
      op: "insert_section_after";
      afterSectionId: string;
      sectionId: string;
      contentMarkdown: string;
    }
  | {
      op: "move_section";
      sectionId: string;
      afterSectionId: string | null;
    };

export type ArticlePatchV1 = {
  contractVersion: "article-patch.v1";
  baseCandidateRevision?: number;
  defectIds?: string[];
  operations: ArticlePatchOp[];
  preservedSectionIds?: string[];
  newClaimIds?: string[];
  closedDefectIds?: string[];
  status?: "OK" | "TARGET_NOT_FOUND" | "PRESERVE_CONFLICT";
};

export type ClaimPatchOp = {
  claimId: string;
  sectionId: string;
  disposition: "keep" | "hedge" | "delete" | "label_opinion" | "rewrite";
  replacementMarkdown?: string;
};

export type ClaimPatchV1 = {
  contractVersion: "claim-patch.v1";
  operations: ClaimPatchOp[];
  preservedClaimIds?: string[];
  closedClaimIds?: string[];
  status?: "OK" | "TARGET_NOT_FOUND" | "EVIDENCE_INSUFFICIENT";
};

export type PatchApplyResult =
  | {
      ok: true;
      document: string;
      sectionsTouched: string[];
      medium: "patch";
    }
  | {
      ok: false;
      reason:
        | "no-patch"
        | "invalid-patch"
        | "target-not-found"
        | "preserve-conflict"
        | "hash-mismatch"
        | "outside-allowlist";
      detail: string;
    };

function sectionIdFromHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[*`#]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function parseMarkdownSections(draft: string): MarkdownSection[] {
  const matches = [...draft.matchAll(/^(#{1,3})\s+(.+)$/gm)];
  if (matches.length === 0) {
    return [
      {
        id: "body",
        heading: "body",
        level: 1,
        content: draft,
        start: 0,
        end: draft.length,
      },
    ];
  }
  return matches.map((match, index) => {
    const heading = match[2].trim();
    const level = match[1].length;
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? draft.length;
    const id =
      index === 0 && match[0].startsWith("# ")
        ? "title"
        : sectionIdFromHeading(heading);
    return {
      id,
      heading,
      level,
      content: draft.slice(start, end).trimEnd(),
      start,
      end,
    };
  });
}

export function hashSectionContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

export function buildSectionHashMap(draft: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const section of parseMarkdownSections(draft)) {
    out[section.id] = hashSectionContent(section.content);
  }
  return out;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseOp(raw: unknown): ArticlePatchOp | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const op = asString(row.op);
  if (op === "replace_section") {
    const sectionId = asString(row.sectionId);
    const contentMarkdown = asString(row.contentMarkdown);
    if (!sectionId || !contentMarkdown) return null;
    return {
      op,
      sectionId,
      expectedHash: asString(row.expectedHash) ?? undefined,
      contentMarkdown,
    };
  }
  if (op === "insert_section_after") {
    const afterSectionId = asString(row.afterSectionId);
    const sectionId = asString(row.sectionId);
    const contentMarkdown = asString(row.contentMarkdown);
    if (!afterSectionId || !sectionId || !contentMarkdown) return null;
    return { op, afterSectionId, sectionId, contentMarkdown };
  }
  if (op === "move_section") {
    const sectionId = asString(row.sectionId);
    if (!sectionId) return null;
    const after =
      row.afterSectionId === null
        ? null
        : asString(row.afterSectionId);
    if (after === undefined && row.afterSectionId !== null) return null;
    return { op, sectionId, afterSectionId: after };
  }
  return null;
}

export function parseArticlePatch(raw: string | null | undefined): {
  patch: ArticlePatchV1 | null;
  reason: string;
} {
  const extracted = extractMarkedJson(raw, ARTICLE_PATCH_MARKER);
  if (!extracted.json) {
    return { patch: null, reason: extracted.reason };
  }
  const json = extracted.json;
  const operations = Array.isArray(json.operations)
    ? json.operations.map(parseOp).filter((op): op is ArticlePatchOp => Boolean(op))
    : [];
  if (operations.length === 0) {
    return { patch: null, reason: "empty-operations" };
  }
  const status = asString(json.status);
  return {
    patch: {
      contractVersion: "article-patch.v1",
      baseCandidateRevision:
        typeof json.baseCandidateRevision === "number"
          ? json.baseCandidateRevision
          : undefined,
      defectIds: Array.isArray(json.defectIds)
        ? json.defectIds.filter((id): id is string => typeof id === "string")
        : [],
      operations,
      preservedSectionIds: Array.isArray(json.preservedSectionIds)
        ? json.preservedSectionIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      newClaimIds: Array.isArray(json.newClaimIds)
        ? json.newClaimIds.filter((id): id is string => typeof id === "string")
        : [],
      closedDefectIds: Array.isArray(json.closedDefectIds)
        ? json.closedDefectIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      status:
        status === "TARGET_NOT_FOUND" || status === "PRESERVE_CONFLICT"
          ? status
          : "OK",
    },
    reason: "ok",
  };
}

export function parseClaimPatch(raw: string | null | undefined): {
  patch: ClaimPatchV1 | null;
  reason: string;
} {
  const extracted = extractMarkedJson(raw, CLAIM_PATCH_MARKER);
  if (!extracted.json) {
    return { patch: null, reason: extracted.reason };
  }
  const json = extracted.json;
  const operations: ClaimPatchOp[] = [];
  if (Array.isArray(json.operations)) {
    for (const item of json.operations) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const claimId = asString(row.claimId);
      const sectionId = asString(row.sectionId);
      const disposition = asString(row.disposition);
      if (!claimId || !sectionId || !disposition) continue;
      if (
        !["keep", "hedge", "delete", "label_opinion", "rewrite"].includes(
          disposition,
        )
      ) {
        continue;
      }
      operations.push({
        claimId,
        sectionId,
        disposition: disposition as ClaimPatchOp["disposition"],
        replacementMarkdown: asString(row.replacementMarkdown) ?? undefined,
      });
    }
  }
  if (operations.length === 0) {
    return { patch: null, reason: "empty-operations" };
  }
  const status = asString(json.status);
  return {
    patch: {
      contractVersion: "claim-patch.v1",
      operations,
      preservedClaimIds: Array.isArray(json.preservedClaimIds)
        ? json.preservedClaimIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      closedClaimIds: Array.isArray(json.closedClaimIds)
        ? json.closedClaimIds.filter((id): id is string => typeof id === "string")
        : [],
      status:
        status === "TARGET_NOT_FOUND" || status === "EVIDENCE_INSUFFICIENT"
          ? status
          : "OK",
    },
    reason: "ok",
  };
}

/**
 * Apply article-patch.v1 onto a base document. Rejects out-of-allowlist edits and
 * mismatched expected hashes.
 */
export function applyArticlePatch(input: {
  baseDocument: string;
  patch: ArticlePatchV1;
  allowlistSectionIds?: string[] | null;
}): PatchApplyResult {
  if (input.patch.status === "TARGET_NOT_FOUND") {
    return {
      ok: false,
      reason: "target-not-found",
      detail: "Model reported TARGET_NOT_FOUND",
    };
  }
  if (input.patch.status === "PRESERVE_CONFLICT") {
    return {
      ok: false,
      reason: "preserve-conflict",
      detail: "Model reported PRESERVE_CONFLICT",
    };
  }

  let sections = parseMarkdownSections(input.baseDocument);
  const allow = input.allowlistSectionIds?.length
    ? new Set(input.allowlistSectionIds.map((id) => id.toLowerCase()))
    : null;
  const touched = new Set<string>();

  for (const op of input.patch.operations) {
    if (op.op === "replace_section") {
      if (allow && !allow.has(op.sectionId.toLowerCase())) {
        return {
          ok: false,
          reason: "outside-allowlist",
          detail: `Section ${op.sectionId} is outside the mutation allowlist`,
        };
      }
      const index = sections.findIndex((section) => section.id === op.sectionId);
      if (index < 0) {
        return {
          ok: false,
          reason: "target-not-found",
          detail: `Missing section ${op.sectionId}`,
        };
      }
      if (op.expectedHash) {
        const actual = hashSectionContent(sections[index].content);
        if (actual !== op.expectedHash) {
          return {
            ok: false,
            reason: "hash-mismatch",
            detail: `Hash mismatch for ${op.sectionId}`,
          };
        }
      }
      sections[index] = {
        ...sections[index],
        content: op.contentMarkdown.trim(),
      };
      touched.add(op.sectionId);
      continue;
    }

    if (op.op === "insert_section_after") {
      if (allow && !allow.has(op.sectionId.toLowerCase())) {
        return {
          ok: false,
          reason: "outside-allowlist",
          detail: `Section ${op.sectionId} is outside the mutation allowlist`,
        };
      }
      const after = sections.findIndex(
        (section) => section.id === op.afterSectionId,
      );
      if (after < 0) {
        return {
          ok: false,
          reason: "target-not-found",
          detail: `Missing anchor section ${op.afterSectionId}`,
        };
      }
      const inserted: MarkdownSection = {
        id: op.sectionId,
        heading: op.sectionId,
        level: 2,
        content: op.contentMarkdown.trim(),
        start: 0,
        end: 0,
      };
      sections = [
        ...sections.slice(0, after + 1),
        inserted,
        ...sections.slice(after + 1),
      ];
      touched.add(op.sectionId);
      continue;
    }

    if (op.op === "move_section") {
      if (allow && !allow.has(op.sectionId.toLowerCase())) {
        return {
          ok: false,
          reason: "outside-allowlist",
          detail: `Section ${op.sectionId} is outside the mutation allowlist`,
        };
      }
      const from = sections.findIndex((section) => section.id === op.sectionId);
      if (from < 0) {
        return {
          ok: false,
          reason: "target-not-found",
          detail: `Missing section ${op.sectionId}`,
        };
      }
      const [moved] = sections.splice(from, 1);
      if (op.afterSectionId === null) {
        sections = [moved, ...sections];
      } else {
        const after = sections.findIndex(
          (section) => section.id === op.afterSectionId,
        );
        if (after < 0) {
          return {
            ok: false,
            reason: "target-not-found",
            detail: `Missing move anchor ${op.afterSectionId}`,
          };
        }
        sections = [
          ...sections.slice(0, after + 1),
          moved,
          ...sections.slice(after + 1),
        ];
      }
      touched.add(op.sectionId);
    }
  }

  // Preserve-mask check: untouched preserved sections must keep content hash.
  if (input.patch.preservedSectionIds?.length) {
    const original = buildSectionHashMap(input.baseDocument);
    const next = Object.fromEntries(
      sections.map((section) => [section.id, hashSectionContent(section.content)]),
    );
    for (const id of input.patch.preservedSectionIds) {
      if (touched.has(id)) {
        return {
          ok: false,
          reason: "preserve-conflict",
          detail: `Preserved section ${id} was modified`,
        };
      }
      if (original[id] && next[id] && original[id] !== next[id]) {
        return {
          ok: false,
          reason: "preserve-conflict",
          detail: `Preserved section ${id} hash changed`,
        };
      }
    }
  }

  return {
    ok: true,
    document: sections.map((section) => section.content.trim()).join("\n\n"),
    sectionsTouched: [...touched],
    medium: "patch",
  };
}

/**
 * Convert claim-patch ops into a narrow article-patch allowlist apply when
 * replacementMarkdown is present; otherwise leave the base document unchanged
 * for keep/delete-only dispositions that need full-draft fallback.
 */
export function claimPatchToArticlePatch(
  claimPatch: ClaimPatchV1,
): ArticlePatchV1 | null {
  const operations: ArticlePatchOp[] = [];
  for (const op of claimPatch.operations) {
    if (!op.replacementMarkdown?.trim()) continue;
    if (op.disposition === "keep") continue;
    operations.push({
      op: "replace_section",
      sectionId: op.sectionId,
      contentMarkdown: op.replacementMarkdown,
    });
  }
  if (operations.length === 0) return null;
  return {
    contractVersion: "article-patch.v1",
    operations,
    preservedSectionIds: [],
    closedDefectIds: claimPatch.closedClaimIds ?? [],
    status: claimPatch.status === "TARGET_NOT_FOUND" ? "TARGET_NOT_FOUND" : "OK",
  };
}

/**
 * Prefer article-patch apply; fall back to treating the raw output as a full draft.
 */
export function resolvePatchedOrFullDraft(input: {
  baseDocument: string;
  rawOutput: string;
  enabled: boolean;
  allowlistSectionIds?: string[] | null;
}): {
  document: string;
  usedPatch: boolean;
  sectionsTouched: string[];
  applyReason: string | null;
} {
  if (!input.enabled) {
    return {
      document: input.rawOutput.trim(),
      usedPatch: false,
      sectionsTouched: [],
      applyReason: "section-patch-disabled",
    };
  }
  const { patch } = parseArticlePatch(input.rawOutput);
  if (patch) {
    const applied = applyArticlePatch({
      baseDocument: input.baseDocument,
      patch,
      allowlistSectionIds: input.allowlistSectionIds,
    });
    if (applied.ok) {
      return {
        document: applied.document,
        usedPatch: true,
        sectionsTouched: applied.sectionsTouched,
        applyReason: null,
      };
    }
    return {
      document: input.rawOutput.trim(),
      usedPatch: false,
      sectionsTouched: [],
      applyReason: `${applied.reason}:${applied.detail}`,
    };
  }

  const claim = parseClaimPatch(input.rawOutput);
  if (claim.patch) {
    const asArticle = claimPatchToArticlePatch(claim.patch);
    if (asArticle) {
      const applied = applyArticlePatch({
        baseDocument: input.baseDocument,
        patch: asArticle,
        allowlistSectionIds:
          input.allowlistSectionIds ??
          claim.patch.operations.map((op) => op.sectionId),
      });
      if (applied.ok) {
        return {
          document: applied.document,
          usedPatch: true,
          sectionsTouched: applied.sectionsTouched,
          applyReason: null,
        };
      }
      return {
        document: input.rawOutput.trim(),
        usedPatch: false,
        sectionsTouched: [],
        applyReason: `${applied.reason}:${applied.detail}`,
      };
    }
  }

  return {
    document: input.rawOutput.trim(),
    usedPatch: false,
    sectionsTouched: [],
    applyReason: "no-patch",
  };
}
