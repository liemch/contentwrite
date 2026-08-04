import { TFES_CONTRACT } from "@/lib/tfes/contract";

export type ResearchEvidenceAudit = {
  passed: boolean;
  urls: string[];
  lineages: string[];
  hasCounterPerspective: boolean;
  hasTierLabels: boolean;
  hasAccessDates: boolean;
  issues: string[];
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
export function auditResearchEvidence(text: string): ResearchEvidenceAudit {
  const urls = [...new Set(text.match(/https?:\/\/[^\s|)>\]"']+/gi) ?? [])];
  const lineages = [
    ...new Set(urls.map(lineageFor).filter((value): value is string => Boolean(value))),
  ];
  const hasCounterPerspective =
    /Different Perspectives|Cross-validation|phản biện mạnh nhất|counter(?:point|argument|evidence)|mâu thuẫn/i.test(
      text,
    );
  const hasTierLabels = /\bTier\s*[1-5]\b/i.test(text);
  const hasAccessDates =
    /Accessed|Ngày truy cập/i.test(text) && /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/.test(text);
  const issues: string[] = [];
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
  };
}
