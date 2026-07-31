/** Registry miền AI-TFES — nguồn sự thật cho UI / auto-write / prompts */

export const DOMAIN_IDS = [
  "engineering",
  "soft-skills",
  "product",
  "ai-ml",
  "security",
] as const;

export type DomainId = (typeof DOMAIN_IDS)[number];

export type DomainMode = DomainId | "rotate";

export type DomainMeta = {
  id: DomainId;
  label: string;
  short: string;
  /** Đường dẫn tương đối trong content/ai-tfes */
  profileFile: string;
  /** Roles Reader Simulation */
  readerRoles: string;
  /** Query gợi ý seed trend (Tavily) */
  trendQueries: string[];
  /** Nhãn ngắn cho LLM khi gợi ý seed */
  seedLabel: string;
};

export const DOMAIN_META: Record<DomainId, DomainMeta> = {
  engineering: {
    id: "engineering",
    label: "engineering — kỹ thuật",
    short: "Engineering",
    profileFile: "04-Domain-Profiles/engineering.md",
    readerRoles: `Roles (engineering): **Junior Engineer** · **Senior Engineer** · **Tech Lead**
Góc: cơ chế, trade-off, failure mode, áp dụng được.`,
    trendQueries: [
      "software engineering architecture trends last 3 months 2026",
      "developer tools platform DevOps AI coding agents trends 2026",
      "cloud reliability observability API security trade-offs 2026",
    ],
    seedLabel: "engineering (architecture, platform, reliability, AI tooling, API)",
  },
  "soft-skills": {
    id: "soft-skills",
    label: "soft-skills — kỹ năng mềm",
    short: "Soft skills",
    profileFile: "04-Domain-Profiles/soft-skills.md",
    readerRoles: `Roles (soft-skills): **Engineer (IC)** · **Tech Lead** · **Engineering Manager**
Góc: giao tiếp, phản hồi, quyết định, cộng tác — evidence-based, không self-help sáo.`,
    trendQueries: [
      "engineering leadership soft skills workplace trends last 3 months 2026",
      "remote team feedback decision making career growth trends 2026",
      "manager communication conflict collaboration trends tech teams 2026",
    ],
    seedLabel: "soft-skills (leadership, feedback, collaboration, career)",
  },
  product: {
    id: "product",
    label: "product — sản phẩm / discovery",
    short: "Product",
    profileFile: "04-Domain-Profiles/product.md",
    readerRoles: `Roles (product): **Product Engineer** · **Product Manager** · **Tech Lead**
Góc: discovery, ưu tiên, đo lường, trade-off phạm vi — cụ thể, không buzzword strategy.`,
    trendQueries: [
      "product management discovery prioritization trends tech 2026",
      "product engineer roadmap metrics experimentation trends 2026",
      "B2B SaaS product trade-offs scope outcomes last 3 months 2026",
    ],
    seedLabel: "product (discovery, prioritization, metrics, product engineering)",
  },
  "ai-ml": {
    id: "ai-ml",
    label: "ai-ml — LLM / AI ứng dụng",
    short: "AI / ML",
    profileFile: "04-Domain-Profiles/ai-ml.md",
    readerRoles: `Roles (ai-ml): **AI Engineer** · **Backend Engineer** · **Tech Lead**
Góc: RAG/eval/agents, cost-latency-quality, failure mode — không hype model card.`,
    trendQueries: [
      "LLM application RAG evaluation agents production trends 2026",
      "AI engineering prompt eval observability cost latency 2026",
      "retrieval augmented generation failure modes trade-offs 2026",
    ],
    seedLabel: "ai-ml (RAG, agents, eval, LLM ops, cost/quality)",
  },
  security: {
    id: "security",
    label: "security — bảo mật / AppSec",
    short: "Security",
    profileFile: "04-Domain-Profiles/security.md",
    readerRoles: `Roles (security): **AppSec Engineer** · **Backend Engineer** · **Tech Lead**
Góc: threat model, control, trade-off DX vs risk — không fear-mongering / checklist rỗng.`,
    trendQueries: [
      "application security AppSec supply chain trends 2026",
      "secure SDLC secrets management zero trust engineering 2026",
      "OWASP cloud identity vulnerability trade-offs last 3 months 2026",
    ],
    seedLabel: "security (AppSec, supply chain, identity, secure SDLC)",
  },
};

export function isDomainId(value: string | null | undefined): value is DomainId {
  return Boolean(value && (DOMAIN_IDS as readonly string[]).includes(value));
}

export function resolveDomainId(raw: string | null | undefined): DomainId {
  return isDomainId(raw) ? raw : "engineering";
}

export function resolveDomainMode(raw: string | null | undefined): DomainMode {
  if (raw === "rotate") return "rotate";
  return resolveDomainId(raw);
}

export function domainProfilePath(domain: string | null | undefined): string {
  return DOMAIN_META[resolveDomainId(domain)].profileFile;
}

export function readerRolesForDomain(domain: string | null | undefined): string {
  return DOMAIN_META[resolveDomainId(domain)].readerRoles;
}

/** Xoay vòng: domain kế tiếp sau lastDomain trong danh sách đầy đủ */
export function nextRotatedDomain(lastDomain: string | null | undefined): DomainId {
  const last = resolveDomainId(lastDomain);
  const idx = DOMAIN_IDS.indexOf(last);
  return DOMAIN_IDS[(idx + 1) % DOMAIN_IDS.length];
}

export function domainSelectOptions(): Array<{ value: DomainId; label: string }> {
  return DOMAIN_IDS.map((id) => ({ value: id, label: DOMAIN_META[id].label }));
}
