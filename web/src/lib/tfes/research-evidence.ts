import { TFES_CONTRACT } from "@/lib/tfes/contract";
import type { DomainResearchMode } from "@/lib/tfes/domains";

export type ResearchEvidenceAudit = {
  passed: boolean;
  urls: string[];
  lineages: string[];
  hasCounterPerspective: boolean;
  hasTierLabels: boolean;
  hasAccessDates: boolean;
  issues: string[];
  mode: DomainResearchMode;
};

function lineageFor(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".").filter(Boolean);
    return parts.length > 2 ? parts.slice(-2).join(".") : host;
  } catch {
    return null;
  }
}

/** Deterministic minimum contract; semantic source authority remains part of LLM review. */
export function auditResearchEvidence(
  text: string,
  mode: DomainResearchMode = "full",
): ResearchEvidenceAudit {
  const urls = [...new Set(text.match(/https?:\/\/[^\s|)>\]"']+/gi) ?? [])];
  const lineages = [
    ...new Set(urls.map(lineageFor).filter((value): value is string => Boolean(value))),
  ];
  const hasCounterPerspective =
    /Different Perspectives|Cross-validation|phản biện mạnh nhất|counter(?:point|argument|evidence)|mâu thuẫn|twist|khi nào không|không nên|giới hạn/i.test(
      text,
    );
  const hasTierLabels = /\bTier\s*[1-5]\b/i.test(text);
  const hasAccessDates =
    /Accessed|Ngày truy cập/i.test(text) && /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/.test(text);
  const issues: string[] = [];

  if (mode === "observation") {
    // Fun: không bắt URL/tier/access date — chỉ cần góc quan sát + phản nhịp.
    const findingish =
      (text.match(/(?:^|\n)\s*[-*]\s+\S+/gm) ?? []).length >= 3 ||
      /finding|quan sát|góc|insight|twist/i.test(text);
    if (!findingish) {
      issues.push("Observation brief thiếu ≥3 góc quan sát / findings");
    }
    if (!hasCounterPerspective) {
      issues.push("Thiếu twist / giới hạn / góc phản (khi nào không vui / không đúng)");
    }
    return {
      passed: issues.length === 0,
      urls,
      lineages,
      hasCounterPerspective,
      hasTierLabels,
      hasAccessDates,
      issues,
      mode,
    };
  }

  if (lineages.length < TFES_CONTRACT.research.minimumIndependentLineages) {
    issues.push(
      `Chỉ có ${lineages.length}/${TFES_CONTRACT.research.minimumIndependentLineages} evidence lineage độc lập`,
    );
  }
  if (TFES_CONTRACT.research.requireCounterPerspective && !hasCounterPerspective) {
    issues.push("Thiếu nguồn/góc phản biện hoặc cross-validation");
  }
  if (!hasTierLabels) issues.push("Thiếu source tier theo Domain Profile");
  if (!hasAccessDates) issues.push("Thiếu ngày truy cập nguồn");
  return {
    passed: issues.length === 0,
    urls,
    lineages,
    hasCounterPerspective,
    hasTierLabels,
    hasAccessDates,
    issues,
    mode,
  };
}
