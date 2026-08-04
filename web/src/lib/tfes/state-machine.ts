import {
  ArticleStatus,
  ArtifactType,
  WorkflowState,
  WorkflowStep,
  Prisma,
  type Article,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { TFES_CONTRACT } from "@/lib/tfes/contract";

const ALLOWED: Record<WorkflowState, readonly WorkflowState[]> = {
  IDEA: [WorkflowState.MEMORY_CHECKED],
  MEMORY_CHECKED: [WorkflowState.RESEARCHED, WorkflowState.RESEARCH_REQUIRED],
  RESEARCHED: [WorkflowState.SYNTHESIZED, WorkflowState.RESEARCH_REQUIRED],
  SYNTHESIZED: [WorkflowState.INSIGHT_APPROVED, WorkflowState.INSIGHT_REJECTED],
  INSIGHT_APPROVED: [WorkflowState.DECIDED, WorkflowState.RESEARCH_REQUIRED],
  DECIDED: [WorkflowState.PLANNED, WorkflowState.MAJOR_REVISION_REQUIRED],
  PLANNED: [WorkflowState.DRAFTED, WorkflowState.REWRITE_REQUIRED],
  DRAFTED: [WorkflowState.EDITORIAL_REVIEWED, WorkflowState.MINOR_REVISION_REQUIRED, WorkflowState.MAJOR_REVISION_REQUIRED, WorkflowState.REWRITE_REQUIRED],
  EDITORIAL_REVIEWED: [WorkflowState.FACT_CHECKED, WorkflowState.FACT_CHECK_FAILED],
  FACT_CHECKED: [WorkflowState.FINAL_REVIEWED, WorkflowState.MINOR_REVISION_REQUIRED, WorkflowState.MAJOR_REVISION_REQUIRED, WorkflowState.REWRITE_REQUIRED],
  FINAL_REVIEWED: [WorkflowState.POLISHED, WorkflowState.MINOR_REVISION_REQUIRED],
  POLISHED: [WorkflowState.READER_SIMULATED, WorkflowState.READER_SIMULATION_FAILED, WorkflowState.MINOR_REVISION_REQUIRED],
  READER_SIMULATED: [WorkflowState.PUBLISH_READY, WorkflowState.MINOR_REVISION_REQUIRED],
  PUBLISH_READY: [WorkflowState.APPROVED, WorkflowState.MINOR_REVISION_REQUIRED],
  APPROVED: [WorkflowState.PUBLISHED],
  PUBLISHED: [WorkflowState.CORRECTED, WorkflowState.RETRACTED, WorkflowState.CORRECTION_REQUIRED],
  RESEARCH_REQUIRED: [WorkflowState.MEMORY_CHECKED, WorkflowState.RESEARCHED],
  INSIGHT_REJECTED: [WorkflowState.RESEARCH_REQUIRED],
  MINOR_REVISION_REQUIRED: [WorkflowState.DRAFTED, WorkflowState.EDITORIAL_REVIEWED, WorkflowState.FACT_CHECKED, WorkflowState.FINAL_REVIEWED, WorkflowState.POLISHED],
  MAJOR_REVISION_REQUIRED: [WorkflowState.RESEARCHED, WorkflowState.PLANNED, WorkflowState.DRAFTED, WorkflowState.EDITORIAL_REVIEWED, WorkflowState.FINAL_REVIEWED],
  REWRITE_REQUIRED: [WorkflowState.PLANNED, WorkflowState.DRAFTED, WorkflowState.EDITORIAL_REVIEWED, WorkflowState.FINAL_REVIEWED],
  FACT_CHECK_FAILED: [WorkflowState.DRAFTED, WorkflowState.EDITORIAL_REVIEWED, WorkflowState.FACT_CHECKED],
  READER_SIMULATION_FAILED: [WorkflowState.POLISHED],
  CORRECTION_REQUIRED: [WorkflowState.CORRECTED, WorkflowState.RETRACTED],
  CORRECTED: [WorkflowState.FACT_CHECKED, WorkflowState.FINAL_REVIEWED, WorkflowState.PUBLISHED],
  RETRACTED: [],
};

export function assertTransitionAllowed(from: WorkflowState, to: WorkflowState): void {
  if (from === to) return;
  if (!ALLOWED[from].includes(to)) {
    throw new Error(`Transition AI-TFES không hợp lệ: ${from} → ${to}`);
  }
}

export function deriveLegacyProjection(state: WorkflowState): {
  status: ArticleStatus;
  currentStep: WorkflowStep | null;
} {
  if (state === WorkflowState.PUBLISH_READY) {
    return { status: ArticleStatus.PUBLISH_READY, currentStep: null };
  }
  if (state === WorkflowState.APPROVED) {
    return { status: ArticleStatus.APPROVED, currentStep: null };
  }
  if (
    state === WorkflowState.PUBLISHED ||
    state === WorkflowState.CORRECTION_REQUIRED ||
    state === WorkflowState.RETRACTED
  ) {
    return { status: ArticleStatus.PUBLISHED, currentStep: null };
  }

  const failed = new Set<WorkflowState>([
    WorkflowState.INSIGHT_REJECTED,
    WorkflowState.MINOR_REVISION_REQUIRED,
    WorkflowState.MAJOR_REVISION_REQUIRED,
    WorkflowState.REWRITE_REQUIRED,
    WorkflowState.FACT_CHECK_FAILED,
    WorkflowState.READER_SIMULATION_FAILED,
  ]).has(state);
  const status = failed ? ArticleStatus.FAILED : ArticleStatus.DRAFT;

  if (
    state === WorkflowState.IDEA ||
    state === WorkflowState.MEMORY_CHECKED ||
    state === WorkflowState.RESEARCHED ||
    state === WorkflowState.RESEARCH_REQUIRED
  ) {
    return { status, currentStep: WorkflowStep.RESEARCH };
  }
  if (
    state === WorkflowState.SYNTHESIZED ||
    state === WorkflowState.INSIGHT_APPROVED ||
    state === WorkflowState.INSIGHT_REJECTED ||
    state === WorkflowState.DECIDED
  ) {
    return { status, currentStep: WorkflowStep.INSIGHT };
  }
  if (state === WorkflowState.PLANNED) {
    return { status, currentStep: WorkflowStep.WRITE };
  }
  return { status, currentStep: WorkflowStep.FINALIZE };
}

export function isWorkflowTerminal(state: WorkflowState): boolean {
  return state === WorkflowState.PUBLISH_READY ||
    state === WorkflowState.APPROVED ||
    state === WorkflowState.PUBLISHED ||
    state === WorkflowState.CORRECTION_REQUIRED ||
    state === WorkflowState.RETRACTED;
}

export type ArtifactInput = {
  type: ArtifactType;
  content: string;
  sourceRevision?: number | null;
  sourceArtifactType?: ArtifactType | null;
  domainProfileVersion?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type ArticleWorkflowPatch = Omit<
  Prisma.ArticleUncheckedUpdateManyInput,
  "status" | "currentStep" | "workflowState" | "workflowVersion" | "workflowRunId"
>;

function transitionArtifact(
  to: WorkflowState,
  action: string,
  details?: Prisma.InputJsonValue,
): ArtifactInput {
  const type =
    to === WorkflowState.APPROVED || to === WorkflowState.PUBLISHED
      ? ArtifactType.PUBLISH_PACKAGE
      : to === WorkflowState.CORRECTED ||
          to === WorkflowState.CORRECTION_REQUIRED ||
          to === WorkflowState.RETRACTED
        ? ArtifactType.CORRECTION
        : to === WorkflowState.RESEARCHED || to === WorkflowState.RESEARCH_REQUIRED
          ? ArtifactType.RESEARCH_BRIEF
          : ArtifactType.REVIEW;
  return {
    type,
    content: `AI-TFES transition artifact\naction: ${action}\nstate: ${to}`,
    metadata: details,
  };
}

/** Atomically append transition + optional immutable artifact, then update canonical state. */
export async function transitionArticle(input: {
  articleId: string;
  to: WorkflowState;
  action: string;
  actorId?: string | null;
  success?: boolean;
  details?: Prisma.InputJsonValue;
  artifact?: ArtifactInput;
  artifacts?: ArtifactInput[];
  articlePatch?: ArticleWorkflowPatch;
  knowledgeRecordPatch?: Prisma.KnowledgeRecordUncheckedUpdateManyInput;
  expectedState?: WorkflowState;
  expectedVersion?: number;
}): Promise<Article> {
  return prisma.$transaction(async (tx) => {
    const article = await tx.article.findUniqueOrThrow({ where: { id: input.articleId } });
    if (input.expectedState && article.workflowState !== input.expectedState) {
      throw new Error(
        `Workflow conflict: expected ${input.expectedState}, got ${article.workflowState}`,
      );
    }
    if (
      input.expectedVersion !== undefined &&
      article.workflowVersion !== input.expectedVersion
    ) {
      throw new Error(
        `Workflow conflict: expected version ${input.expectedVersion}, got ${article.workflowVersion}`,
      );
    }
    assertTransitionAllowed(article.workflowState, input.to);

    const legacy = deriveLegacyProjection(input.to);
    const claimed = await tx.article.updateMany({
      where: {
        id: article.id,
        workflowState: article.workflowState,
        workflowVersion: article.workflowVersion,
      },
      data: {
        ...input.articlePatch,
        workflowState: input.to,
        workflowVersion: { increment: 1 },
        status: legacy.status,
        currentStep: legacy.currentStep,
      },
    });
    if (claimed.count !== 1) {
      throw new Error("Workflow conflict: article đã được worker khác cập nhật");
    }
    if (input.knowledgeRecordPatch) {
      await tx.knowledgeRecord.updateMany({
        where: { articleId: article.id },
        data: input.knowledgeRecordPatch,
      });
    }

    const artifacts = input.artifacts ?? [
      input.artifact ?? transitionArtifact(input.to, input.action, input.details),
    ];
    for (const artifact of artifacts) {
      const latest = await tx.workflowArtifact.aggregate({
        where: {
          articleId: article.id,
          workflowRunId: article.workflowRunId,
          type: artifact.type,
        },
        _max: { revision: true },
      });
      await tx.workflowArtifact.create({
        data: {
          articleId: article.id,
          workflowRunId: article.workflowRunId,
          type: artifact.type,
          revision: (latest._max.revision ?? 0) + 1,
          sourceRevision: artifact.sourceRevision,
          sourceArtifactType: artifact.sourceArtifactType,
          schemaVersion: TFES_CONTRACT.artifactSchemaVersion,
          operatingPromptVersion: TFES_CONTRACT.operatingPromptVersion,
          domainProfileVersion: artifact.domainProfileVersion,
          state: input.to,
          content: artifact.content,
          metadata: artifact.metadata,
        },
      });
    }

    await tx.workflowTransition.create({
      data: {
        articleId: article.id,
        workflowRunId: article.workflowRunId,
        fromState: article.workflowState,
        toState: input.to,
        action: input.action,
        success: input.success ?? true,
        actorId: input.actorId,
        details: input.details,
      },
    });

    return tx.article.findUniqueOrThrow({ where: { id: article.id } });
  });
}

/** Atomic same-state mutation for partial phases that do not advance the canonical state. */
export async function patchWorkflowArticle(input: {
  articleId: string;
  action: string;
  articlePatch: ArticleWorkflowPatch;
  actorId?: string | null;
  details?: Prisma.InputJsonValue;
  artifact?: ArtifactInput;
  artifacts?: ArtifactInput[];
  expectedState?: WorkflowState;
  expectedVersion?: number;
  success?: boolean;
}): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: input.articleId } });
  return transitionArticle({
    ...input,
    to: article.workflowState,
    expectedState: input.expectedState ?? article.workflowState,
    expectedVersion: input.expectedVersion ?? article.workflowVersion,
  });
}

export async function resetWorkflowArticle(input: {
  articleId: string;
  articlePatch: ArticleWorkflowPatch;
  actorId?: string | null;
}): Promise<Article> {
  return prisma.$transaction(async (tx) => {
    const article = await tx.article.findUniqueOrThrow({ where: { id: input.articleId } });
    const nextRunId = crypto.randomUUID();
    const legacy = deriveLegacyProjection(WorkflowState.IDEA);
    const updated = await tx.article.updateMany({
      where: {
        id: article.id,
        workflowState: article.workflowState,
        workflowVersion: article.workflowVersion,
      },
      data: {
        ...input.articlePatch,
        workflowState: WorkflowState.IDEA,
        workflowRunId: nextRunId,
        workflowVersion: { increment: 1 },
        status: legacy.status,
        currentStep: legacy.currentStep,
      },
    });
    if (updated.count !== 1) {
      throw new Error("Workflow conflict: không thể reset vì article vừa được cập nhật");
    }
    await tx.workflowTransition.create({
      data: {
        articleId: article.id,
        workflowRunId: article.workflowRunId,
        fromState: article.workflowState,
        toState: WorkflowState.IDEA,
        action: "reset-workflow",
        actorId: input.actorId,
        details: { nextWorkflowRunId: nextRunId },
      },
    });
    return tx.article.findUniqueOrThrow({ where: { id: article.id } });
  });
}

export async function latestArtifactRevision(
  articleId: string,
  type: ArtifactType,
): Promise<number | null> {
  const latest = await prisma.workflowArtifact.findFirst({
    where: { articleId, type },
    orderBy: { createdAt: "desc" },
    select: { revision: true },
  });
  return latest?.revision ?? null;
}

/** One-time compatibility backfill for articles created before workflowState v1.6 existed. */
export async function bootstrapLegacyWorkflowState(articleId: string): Promise<void> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  if (article.workflowState !== WorkflowState.IDEA) return;

  let inferred: WorkflowState = WorkflowState.IDEA;
  if (article.status === ArticleStatus.PUBLISHED) inferred = WorkflowState.PUBLISHED;
  else if (article.status === ArticleStatus.APPROVED) inferred = WorkflowState.APPROVED;
  else if (article.status === ArticleStatus.PUBLISH_READY) inferred = WorkflowState.PUBLISH_READY;
  else if ((article.knowledgeRecord ?? "").includes("TFES_READER_SIM_DONE")) inferred = WorkflowState.READER_SIMULATED;
  else if ((article.cleanPublish ?? "").includes("TFES_CLEAN_POLISHED")) inferred = WorkflowState.POLISHED;
  else if ((article.knowledgeRecord ?? "").includes("TFES_FINAL_REVIEW_DONE")) inferred = WorkflowState.FINAL_REVIEWED;
  else if ((article.factCheck ?? "").trim()) inferred = WorkflowState.FACT_CHECKED;
  else if ((article.knowledgeRecord ?? "").includes("TFES_REVIEW_DONE")) inferred = WorkflowState.EDITORIAL_REVIEWED;
  else if ((article.draft12 ?? "").includes("TFES_DRAFT_DONE")) inferred = WorkflowState.DRAFTED;
  else if ((article.insightGate ?? "").includes("TFES_INSIGHT_DONE")) inferred = WorkflowState.PLANNED;
  else if ((article.insightGate ?? "").includes("TFES_INSIGHT_DECISION")) inferred = WorkflowState.DECIDED;
  else if ((article.insightGate ?? "").includes("TFES_INSIGHT_GATE")) inferred = WorkflowState.INSIGHT_APPROVED;
  else if ((article.researchBrief ?? "").trim()) inferred = WorkflowState.SYNTHESIZED;

  if (inferred === WorkflowState.IDEA) return;
  const legacy = deriveLegacyProjection(inferred);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.article.updateMany({
      where: { id: articleId, workflowState: WorkflowState.IDEA, workflowVersion: article.workflowVersion },
      data: {
        workflowState: inferred,
        workflowVersion: { increment: 1 },
        status: legacy.status,
        currentStep: legacy.currentStep,
      },
    });
    if (updated.count !== 1) return;
    await tx.workflowTransition.create({
      data: {
        articleId,
        workflowRunId: article.workflowRunId,
        fromState: WorkflowState.IDEA,
        toState: inferred,
        action: "legacy-v1.6-backfill",
        details: { compatibilityBackfill: true },
      },
    });
  });
}
