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
const EDITORIAL_ACTIONS = new Set([
  "editorial-review",
  "editorial-review-after-revision",
]);
const DRAFT_CHANGING_ACTIONS = new Set([
  "remediate-required-revision",
  "remediate-fact-check",
  "manual-draft-revision",
]);

const rate = (numerator, denominator) =>
  denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;

function telemetryOf(transition) {
  const details = transition.details;
  return details && typeof details === "object" && details.telemetry
    ? details.telemetry
    : null;
}

function scoreOf(transition) {
  const score = telemetryOf(transition)?.totalScore;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
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
  let editorialScoreComparisons = 0;
  let editorialNonDecreasingComparisons = 0;
  let editorialScoreDeltaSum = 0;
  let candidateScoreComparisons = 0;
  let candidateRegressions = 0;
  let retryConvergingComparisons = 0;
  let finalScoreComparisons = 0;
  let finalRegressions = 0;
  let finalScoreDeltaSum = 0;
  let rewriteCount = 0;
  let lockCandidateComparisons = 0;
  let lockCandidateRegressions = 0;
  let rejectedRegressionCount = 0;
  let rejectedCandidateRetentionComparisons = 0;
  let retainedBestCount = 0;
  let rejectedScoreDeltaCount = 0;
  let rejectedScoreDeltaSum = 0;
  let exhaustionBestRetentionComparisons = 0;
  let exhaustionWithBestRetained = 0;
  let revisionRemediationArticles = 0;
  let revisionConvergedArticles = 0;
  let manualRecoveryArticles = 0;
  let finalMinorObservations = 0;
  let finalMinorEligible = 0;
  let guardEnabledEligible = 0;
  let finalMinorSuppressed = 0;
  let suppressedFinalMinorEvents = 0;
  let postSuppressionLocked = 0;
  let postSuppressionHumanCorrections = 0;
  let brakeAutoAckEligible = 0;
  let regressionAutoAckSuppressions = 0;
  let brakeEvents = 0;
  let regressionLoopsInterrupted = 0;
  let humanInterventionsAfterBrake = 0;
  let completionsAfterBrake = 0;
  const aiTfesVersionEvents = { "v1.6": 0, "v2-rc1": 0, unknown: 0 };
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
    const revisionRemediations = actions.filter(
      (action) => action === "remediate-required-revision",
    ).length;
    const exhausted = transitions.some((transition) => {
      if (!EXHAUSTED_ACTIONS.has(transition.action)) return false;
      if (transition.action !== "final-verification-format-invalid") return true;
      return telemetryOf(transition)?.result === "exhausted";
    });
    const manual = actions.some((action) => MANUAL_ACTIONS.has(action));
    rewriteCount += actions.filter(
      (action) => action === "remediate-required-revision",
    ).length;
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
    if (actions.includes("manual-draft-revision")) manualRecoveryArticles += 1;
    if (revisionRemediations > 0) {
      revisionRemediationArticles += 1;
      const revisionExhausted = actions.includes("revision-remediation-exhausted");
      if (completed && !revisionExhausted) revisionConvergedArticles += 1;
    }

    let latestEditorialScore = null;
    let draftChangedSinceEditorial = false;
    for (const transition of transitions) {
      const score = scoreOf(transition);
      if (
        latestEditorialScore !== null &&
        DRAFT_CHANGING_ACTIONS.has(transition.action)
      ) {
        draftChangedSinceEditorial = true;
      }
      if (EDITORIAL_ACTIONS.has(transition.action) && score !== null) {
        if (latestEditorialScore !== null) {
          const delta = score - latestEditorialScore;
          editorialScoreComparisons += 1;
          editorialScoreDeltaSum += delta;
          if (delta >= 0) editorialNonDecreasingComparisons += 1;
          if (transition.action === "editorial-review-after-revision") {
            candidateScoreComparisons += 1;
            if (delta < 0) candidateRegressions += 1;
            if (delta >= 0) retryConvergingComparisons += 1;
          }
        }
        latestEditorialScore = score;
        draftChangedSinceEditorial = false;
      } else if (
        transition.action === "final-verification" &&
        score !== null &&
        latestEditorialScore !== null &&
        !draftChangedSinceEditorial
      ) {
        const finalDelta = score - latestEditorialScore;
        finalScoreComparisons += 1;
        finalScoreDeltaSum += finalDelta;
        if (finalDelta < 0) finalRegressions += 1;
      }
    }

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
    for (const [transitionIndex, transition] of transitions.entries()) {
      const telemetry = telemetryOf(transition);
      if (!telemetry) continue;
      telemetryEvents += 1;
      if (telemetry.aiTfesVersion === "v1.6") aiTfesVersionEvents["v1.6"] += 1;
      else if (telemetry.aiTfesVersion === "v2-rc1") {
        aiTfesVersionEvents["v2-rc1"] += 1;
      } else aiTfesVersionEvents.unknown += 1;
      const finalGuard = telemetry.finalMinorGuard;
      if (
        finalGuard &&
        [
          "craft-only",
          "blocking-residual",
          "unknown-residual",
          "precondition-failed",
        ].includes(finalGuard.finalMinorReasonClass)
      ) {
        finalMinorObservations += 1;
        if (finalGuard.finalMinorGuardEligible === true) {
          finalMinorEligible += 1;
          if (finalGuard.guardEnabled === true) guardEnabledEligible += 1;
        }
        if (finalGuard.finalMinorSuppressed === true) {
          finalMinorSuppressed += 1;
          suppressedFinalMinorEvents += 1;
          if (transition.success === true) postSuppressionLocked += 1;
          const laterHumanCorrection = transitions
            .slice(transitionIndex + 1)
            .some((later) => MANUAL_ACTIONS.has(later.action));
          if (laterHumanCorrection) postSuppressionHumanCorrections += 1;
        }
      }
      const brake = telemetry.autoAckBrake;
      if (brake?.brakeEnabled === true && brake.autoAckEligible === true) {
        brakeAutoAckEligible += 1;
        if (brake.autoAckSuppressedForRegression === true) {
          regressionAutoAckSuppressions += 1;
        }
        if (brake.humanBrakeTriggered === true) {
          brakeEvents += 1;
          const later = transitions.slice(transitionIndex + 1);
          const nextRemediation = later.findIndex(
            (candidate) => candidate.action === "remediate-required-revision",
          );
          const nextHuman = later.findIndex((candidate) =>
            ["human-review-confirmed", "manual-draft-revision"].includes(
              candidate.action,
            ),
          );
          if (
            nextRemediation < 0 ||
            (nextHuman >= 0 && nextHuman < nextRemediation)
          ) {
            regressionLoopsInterrupted += 1;
          }
          if (nextHuman >= 0) humanInterventionsAfterBrake += 1;
          if (completed) completionsAfterBrake += 1;
        }
      }
      const lock = telemetry.convergence;
      if (
        EDITORIAL_ACTIONS.has(transition.action) &&
        typeof lock?.lockEnabled === "boolean"
      ) {
        if (typeof lock.candidateRegression === "boolean") {
          lockCandidateComparisons += 1;
          if (lock.candidateRegression) lockCandidateRegressions += 1;
        }
        if (lock.candidateRejected === true) {
          if (lock.candidateRegression === true) rejectedRegressionCount += 1;
          if (typeof lock.candidateScoreDelta === "number") {
            rejectedScoreDeltaCount += 1;
            rejectedScoreDeltaSum += lock.candidateScoreDelta;
          }
          if (
            lock.restoreStatus === "restored" ||
            lock.restoreStatus === "missing-artifact"
          ) {
            rejectedCandidateRetentionComparisons += 1;
            if (lock.restoreStatus === "restored") retainedBestCount += 1;
          }
        }
      }
      if (
        transition.action === "revision-remediation-exhausted" &&
        lock?.lockEnabled === true &&
        typeof lock.bestRetainedAtExhaustion === "boolean"
      ) {
        exhaustionBestRetentionComparisons += 1;
        if (lock.bestRetainedAtExhaustion) exhaustionWithBestRetained += 1;
      }
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
      editorialScoreComparisons,
      candidateScoreComparisons,
      finalScoreComparisons,
      retryScoreComparisons: candidateScoreComparisons,
      lockCandidateComparisons,
      rejectedCandidateRetentionComparisons,
      rejectedScoreDeltaCount,
      exhaustionBestRetentionComparisons,
      revisionRemediationArticles,
      exhaustedArticles,
      finalMinorObservations,
      guardEnabledEligible,
      suppressedFinalMinorEvents,
      brakeAutoAckEligible,
      brakeEvents,
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
    manualRecoveryRate: rate(manualRecoveryArticles, exhaustedArticles),
    revisionConvergenceRate: rate(
      revisionConvergedArticles,
      revisionRemediationArticles,
    ),
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
    convergence: {
      editorialScoreMonotonicityRate: rate(
        editorialNonDecreasingComparisons,
        editorialScoreComparisons,
      ),
      averageEditorialScoreDelta:
        editorialScoreComparisons > 0
          ? Number((editorialScoreDeltaSum / editorialScoreComparisons).toFixed(2))
          : null,
      candidateRegressionRate: rate(
        candidateRegressions,
        candidateScoreComparisons,
      ),
      finalRegressionRate: rate(finalRegressions, finalScoreComparisons),
      averageFinalScoreDelta:
        finalScoreComparisons > 0
          ? Number((finalScoreDeltaSum / finalScoreComparisons).toFixed(2))
          : null,
      retryConvergenceRate: rate(
        retryConvergingComparisons,
        candidateScoreComparisons,
      ),
      averageRewriteCountPerArticle:
        total > 0 ? Number((rewriteCount / total).toFixed(2)) : null,
    },
    candidateLock: {
      candidateRegressionRate: rate(
        lockCandidateRegressions,
        lockCandidateComparisons,
      ),
      rejectedRegressionCount,
      retainedBestRate: rate(
        retainedBestCount,
        rejectedCandidateRetentionComparisons,
      ),
      averageRejectedScoreDelta:
        rejectedScoreDeltaCount > 0
          ? Number((rejectedScoreDeltaSum / rejectedScoreDeltaCount).toFixed(2))
          : null,
      exhaustionWithBestRetainedRate: rate(
        exhaustionWithBestRetained,
        exhaustionBestRetentionComparisons,
      ),
    },
    finalMinorGuard: {
      falseFinalMinorEligibleRate: rate(
        finalMinorEligible,
        finalMinorObservations,
      ),
      suppressedFinalMinorRate: rate(
        finalMinorSuppressed,
        guardEnabledEligible,
      ),
      postSuppressionPublishOrLockRate: rate(
        postSuppressionLocked,
        suppressedFinalMinorEvents,
      ),
      laterHumanCorrectionRate: rate(
        postSuppressionHumanCorrections,
        suppressedFinalMinorEvents,
      ),
    },
    regressionAutoAckBrake: {
      suppressionRate: rate(
        regressionAutoAckSuppressions,
        brakeAutoAckEligible,
      ),
      regressionLoopsInterruptedRate: rate(
        regressionLoopsInterrupted,
        brakeEvents,
      ),
      humanInterventionAfterBrakeRate: rate(
        humanInterventionsAfterBrake,
        brakeEvents,
      ),
      completionAfterBrakeRate: rate(completionsAfterBrake, brakeEvents),
    },
    aiTfesVersionEvents,
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
      editorialNonDecreasingComparisons,
      candidateRegressions,
      finalRegressions,
      retryConvergingComparisons,
      rewriteCount,
      lockCandidateRegressions,
      rejectedRegressionCount,
      retainedBestCount,
      exhaustionWithBestRetained,
      revisionConvergedArticles,
      manualRecoveryArticles,
      finalMinorEligible,
      finalMinorSuppressed,
      postSuppressionLocked,
      postSuppressionHumanCorrections,
      regressionAutoAckSuppressions,
      regressionLoopsInterrupted,
      humanInterventionsAfterBrake,
      completionsAfterBrake,
    },
  };
}
