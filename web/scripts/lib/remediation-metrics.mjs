const COMPLETED_STATES = new Set(["PUBLISH_READY", "APPROVED", "PUBLISHED"]);
const REMEDIATION_ACTIONS = new Set([
  "remediate-required-revision",
  "remediate-fact-check",
]);
const EXHAUSTED_ACTIONS = new Set([
  "revision-remediation-exhausted",
  "fact-remediation-exhausted",
  "final-verification-format-invalid",
]);
const MANUAL_ACTIONS = new Set([
  "manual-draft-revision",
  "human-edit",
  "human-edit-invalidated-final-review",
  "human-polish",
  "human-review-confirmed",
  "save-fact-human-verdicts",
]);

const rate = (numerator, denominator) =>
  denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;

function telemetryOf(transition) {
  const details = transition.details;
  return details && typeof details === "object" && details.telemetry
    ? details.telemetry
    : null;
}

function addDistributionValue(distribution, value) {
  if (!Number.isFinite(value) || value < 0) return false;
  const key = String(Math.round(value));
  distribution[key] = (distribution[key] ?? 0) + 1;
  return true;
}

function sortedDistribution(distribution) {
  return Object.fromEntries(
    Object.entries(distribution).sort(([a], [b]) => Number(a) - Number(b)),
  );
}

export function aggregateRemediationMetrics(articles) {
  const gateFailDistribution = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [`G${index + 1}`, 0]),
  );
  const llmByPhase = new Map();
  let firstPass = 0;
  let remediationArticles = 0;
  let remediationPassed = 0;
  let exhaustedArticles = 0;
  let remediationAttempts = 0;
  let formatFailures = 0;
  let finalVerifyAttempts = 0;
  let timeoutEvents = 0;
  let telemetryEvents = 0;
  let truncationIndicators = 0;
  let manualInterventionArticles = 0;
  let recoveryAttempts = 0;
  let recoverySuccesses = 0;
  let factCheckAttempts = 0;
  let articlesWithFactCheck = 0;
  let factFirstPassArticles = 0;
  let articlesWithFactRemediation = 0;
  let factRemediationPassedArticles = 0;
  let malformedFactOutputs = 0;
  let factAttemptsWithMalformedFlag = 0;
  let factAttemptsWithBlockingCount = 0;
  let factAttemptsWithUnsupportedCount = 0;
  let factAttemptsWithClaimsWithoutSourceCount = 0;
  const blockingClaimDistribution = {};
  const unsupportedClaimDistribution = {};
  const claimsWithoutSourceDistribution = {};
  const scoreTrend = { improved: 0, flat: 0, declined: 0, unavailable: 0 };
  const feedbackTotals = {
    finalUsability: 0,
    manualEditEffort: 0,
    errorHelpfulness: 0,
    reuseIntent: 0,
  };
  let feedbackCount = 0;

  for (const article of articles) {
    const transitions = [...(article.transitions ?? [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const actions = transitions.map((transition) => transition.action);
    const completed = COMPLETED_STATES.has(article.workflowState);
    const remediations = actions.filter((action) => REMEDIATION_ACTIONS.has(action)).length;
    const exhausted = transitions.some((transition) => {
      if (!EXHAUSTED_ACTIONS.has(transition.action)) return false;
      if (transition.action !== "final-verification-format-invalid") return true;
      return telemetryOf(transition)?.result === "exhausted";
    });
    const manual = actions.some((action) => MANUAL_ACTIONS.has(action));
    const factChecks = transitions.filter((transition) => transition.action === "fact-check");
    const factRemediations = transitions.filter(
      (transition) => transition.action === "remediate-fact-check",
    );
    factCheckAttempts += factChecks.length;
    if (factChecks.length > 0) {
      articlesWithFactCheck += 1;
      if (factChecks[0].success === true) factFirstPassArticles += 1;
    }
    if (factRemediations.length > 0) {
      articlesWithFactRemediation += 1;
      const firstRemediationAt = new Date(factRemediations[0].createdAt).getTime();
      const laterFactPass = factChecks.some(
        (transition) =>
          transition.success === true &&
          new Date(transition.createdAt).getTime() > firstRemediationAt,
      );
      if (laterFactPass) factRemediationPassedArticles += 1;
    }
    remediationAttempts += remediations;
    if (completed && remediations === 0) firstPass += 1;
    if (remediations > 0) {
      remediationArticles += 1;
      if (completed && !exhausted) remediationPassed += 1;
    }
    if (exhausted) exhaustedArticles += 1;
    if (manual) manualInterventionArticles += 1;
    try {
      const feedback = JSON.parse(article.deskJson ?? "{}").validationFeedback;
      if (feedback) {
        feedbackCount += 1;
        for (const key of Object.keys(feedbackTotals)) {
          feedbackTotals[key] += Number(feedback[key] ?? 0);
        }
      }
    } catch {
      // Invalid legacy deskJson remains visible through a zero feedback denominator.
    }

    const scores = [];
    let articleHasTruncationIndicator = false;
    for (const transition of transitions) {
      const telemetry = telemetryOf(transition);
      if (!telemetry) continue;
      telemetryEvents += 1;
      if (transition.action === "fact-check" && telemetry.fact) {
        const fact = telemetry.fact;
        if (typeof fact.malformedOutput === "boolean") {
          factAttemptsWithMalformedFlag += 1;
          if (fact.malformedOutput) malformedFactOutputs += 1;
        }
        if (addDistributionValue(blockingClaimDistribution, fact.blockingClaimCount)) {
          factAttemptsWithBlockingCount += 1;
        }
        if (
          addDistributionValue(
            unsupportedClaimDistribution,
            fact.unsupportedClaimCount,
          )
        ) {
          factAttemptsWithUnsupportedCount += 1;
        }
        if (
          addDistributionValue(
            claimsWithoutSourceDistribution,
            fact.claimsWithoutSourceCount,
          )
        ) {
          factAttemptsWithClaimsWithoutSourceCount += 1;
        }
      }
      for (const gate of telemetry.gateFailures ?? []) {
        if (gate in gateFailDistribution) gateFailDistribution[gate] += 1;
      }
      if (typeof telemetry.totalScore === "number") scores.push(telemetry.totalScore);
      if (transition.action === "final-verification") finalVerifyAttempts += 1;
      if (transition.action === "final-verification-format-invalid") {
        finalVerifyAttempts += 1;
        formatFailures += 1;
      }
      if (telemetry.errorClass === "timeout") timeoutEvents += 1;
      if (typeof telemetry.llmMs === "number") {
        const phase = telemetry.transitionName ?? transition.action;
        const bucket = llmByPhase.get(phase) ?? [];
        bucket.push(telemetry.llmMs);
        llmByPhase.set(phase, bucket);
      }
      const shortForTarget =
        article.targetWordCount &&
        telemetry.draftCharacterLength < article.targetWordCount * 3;
      const missingExpectedSection =
        !telemetry.hasKeyTakeaways ||
        !telemetry.hasDiscussion ||
        !telemetry.hasReferences;
      articleHasTruncationIndicator ||= Boolean(shortForTarget || missingExpectedSection);
    }
    if (articleHasTruncationIndicator) truncationIndicators += 1;

    if (scores.length < 2) scoreTrend.unavailable += 1;
    else {
      const delta = scores.at(-1) - scores[0];
      if (delta > 0) scoreTrend.improved += 1;
      else if (delta < 0) scoreTrend.declined += 1;
      else scoreTrend.flat += 1;
    }

    transitions.forEach((transition, index) => {
      if (transition.action !== "manual-draft-revision") return;
      recoveryAttempts += 1;
      const laterPass = transitions.slice(index + 1).some((candidate) => {
        const telemetry = telemetryOf(candidate);
        return (
          candidate.action.startsWith("editorial-review") &&
          telemetry?.result === "pass"
        );
      });
      if (laterPass) recoverySuccesses += 1;
    });
  }

  const averageLlmMsByPhase = Object.fromEntries(
    [...llmByPhase.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([phase, values]) => [
        phase,
        Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      ]),
  );
  const total = articles.length;
  return {
    denominators: {
      articles: total,
      remediationArticles,
      finalVerifyAttempts,
      telemetryEvents,
      recoveryAttempts,
        factCheckAttempts,
        articlesWithFactCheck,
        articlesWithFactRemediation,
        factAttemptsWithMalformedFlag,
        factAttemptsWithBlockingCount,
        factAttemptsWithUnsupportedCount,
        factAttemptsWithClaimsWithoutSourceCount,
    },
    firstPassRate: rate(firstPass, total),
    remediationPassRate: rate(remediationPassed, remediationArticles),
    exhaustionRate: rate(exhaustedArticles, total),
    averageRemediationAttempts:
      total > 0 ? Number((remediationAttempts / total).toFixed(2)) : null,
    gateFailDistribution,
    parseFormatFailureRate: rate(formatFailures, finalVerifyAttempts),
    timeoutRate: rate(timeoutEvents, telemetryEvents),
    averageLlmMsByPhase,
    draftTruncationIndicatorRate: rate(truncationIndicators, total),
    recoverySuccessRate: rate(recoverySuccesses, recoveryAttempts),
    editorManualInterventionRate: rate(manualInterventionArticles, total),
    factCheck: {
      averageAttemptsPerArticle:
        total > 0 ? Number((factCheckAttempts / total).toFixed(2)) : null,
      firstPassRate: rate(factFirstPassArticles, articlesWithFactCheck),
      remediationPassRate: rate(
        factRemediationPassedArticles,
        articlesWithFactRemediation,
      ),
      blockingClaimDistribution: sortedDistribution(blockingClaimDistribution),
      unsupportedClaimDistribution: sortedDistribution(
        unsupportedClaimDistribution,
      ),
      claimsWithoutSourceDistribution: sortedDistribution(
        claimsWithoutSourceDistribution,
      ),
      malformedOutputRate: rate(
        malformedFactOutputs,
        factAttemptsWithMalformedFlag,
      ),
    },
    scoreTrend,
    editorFeedback: {
      responses: feedbackCount,
      averageFinalUsability:
        feedbackCount > 0
          ? Number((feedbackTotals.finalUsability / feedbackCount).toFixed(2))
          : null,
      averageManualEditEffort:
        feedbackCount > 0
          ? Number((feedbackTotals.manualEditEffort / feedbackCount).toFixed(2))
          : null,
      averageErrorHelpfulness:
        feedbackCount > 0
          ? Number((feedbackTotals.errorHelpfulness / feedbackCount).toFixed(2))
          : null,
      averageReuseIntent:
        feedbackCount > 0
          ? Number((feedbackTotals.reuseIntent / feedbackCount).toFixed(2))
          : null,
    },
    counts: {
      firstPass,
      remediationPassed,
      exhaustedArticles,
      remediationAttempts,
      formatFailures,
      timeoutEvents,
      truncationIndicators,
      manualInterventionArticles,
      recoverySuccesses,
      factCheckAttempts,
      factFirstPassArticles,
      factRemediationPassedArticles,
      malformedFactOutputs,
    },
  };
}
