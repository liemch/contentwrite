const READER_META_LEAK_PATTERNS = [
  { id: "insight-tier", pattern: /Insight\s*L\s*[0-3]/i },
  { id: "insight-gate-en", pattern: /\bInsight\s*Gate\b/i },
  { id: "insight-gate-vi", pattern: /\bCổng\s*Insight\b/i },
  { id: "tier-floor", pattern: /≥\s*L\s*[0-3]/i },
  { id: "gold-bar", pattern: /\bGOLD_BAR\b/i },
  { id: "provisional-score", pattern: /\bPROVISIONAL_(?:TOTAL|INSIGHT)_SCORE\b/i },
  { id: "editorial-decision", pattern: /\bEDITORIAL_DECISION\b/i },
  { id: "gates-g1-g8", pattern: /\bGATES_G1_G8\b/i },
  { id: "final-score", pattern: /\bFINAL_(?:TOTAL|INSIGHT)_SCORE\b/i },
];

export function detectReaderMetaLeak(text) {
  if (!text?.trim()) return [];
  const hits = [];
  for (const { id, pattern } of READER_META_LEAK_PATTERNS) {
    if (pattern.test(text)) hits.push(id);
  }
  return hits;
}

export function hasReaderMetaLeak(text) {
  return detectReaderMetaLeak(text).length > 0;
}
