/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Report generation for evaluation results.
 * Produces Markdown and JSON reports with score breakdowns.
 */

import type { ScoreCard, EvalResult, CategoryScore } from './types.js';

/**
 * Generates a Markdown report from the score card and individual results.
 *
 * @param scoreCard The aggregate score card.
 * @param results The individual scenario results.
 * @returns A formatted Markdown string.
 */
export function generateMarkdown(
  scoreCard: ScoreCard,
  results: EvalResult[],
): string {
  const lines: string[] = [];

  lines.push('# Behavioral Evaluation Report');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Total Scenarios | ${scoreCard.totalScenarios} |`);
  lines.push(
    `| Passed | ${scoreCard.passed} (${percentage(scoreCard.passed, scoreCard.totalScenarios)}) |`,
  );
  lines.push(
    `| Failed | ${scoreCard.failed} (${percentage(scoreCard.failed, scoreCard.totalScenarios)}) |`,
  );
  lines.push(`| Average Score | ${scoreCard.averageScore}/100 |`);
  lines.push(`| Total Duration | ${formatDuration(scoreCard.duration)} |`);
  lines.push('');

  // Category breakdown.
  lines.push('## By Category');
  lines.push('');
  lines.push(formatCategoryTable(scoreCard.byCategory));
  lines.push('');

  // Difficulty breakdown.
  lines.push('## By Difficulty');
  lines.push('');
  lines.push(formatCategoryTable(scoreCard.byDifficulty));
  lines.push('');

  // Individual results.
  lines.push('## Scenario Results');
  lines.push('');
  lines.push('| Scenario | Score | Status | Duration | Errors |');
  lines.push('| --- | --- | --- | --- | --- |');

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    const errorSummary =
      result.errors.length > 0 ? result.errors.length.toString() : '-';
    lines.push(
      `| ${result.scenarioId} | ${result.score}/100 | ${status} | ${formatDuration(result.duration)} | ${errorSummary} |`,
    );
  }

  lines.push('');

  // Failed scenario details.
  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push('## Failed Scenario Details');
    lines.push('');
    for (const result of failed) {
      lines.push(`### ${result.scenarioId}`);
      lines.push('');
      lines.push(`**Score:** ${result.score}/100`);
      lines.push('');
      if (result.errors.length > 0) {
        lines.push('**Errors:**');
        for (const err of result.errors) {
          lines.push(`- ${err}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generates a JSON report from the score card and individual results.
 *
 * @param scoreCard The aggregate score card.
 * @param results The individual scenario results.
 * @returns A formatted JSON string.
 */
export function generateJSON(
  scoreCard: ScoreCard,
  results: EvalResult[],
): string {
  const report = {
    generatedAt: new Date().toISOString(),
    scoreCard,
    results: results.map((r) => ({
      scenarioId: r.scenarioId,
      passed: r.passed,
      score: r.score,
      duration: r.duration,
      errorCount: r.errors.length,
      errors: r.errors,
    })),
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Formats a category score map into a Markdown table.
 */
function formatCategoryTable(
  categories: Record<string, CategoryScore>,
): string {
  const lines: string[] = [];
  lines.push('| Category | Total | Passed | Pass Rate | Avg Score |');
  lines.push('| --- | --- | --- | --- | --- |');

  for (const [name, score] of Object.entries(categories)) {
    lines.push(
      `| ${name} | ${score.total} | ${score.passed} | ${percentage(score.passed, score.total)} | ${score.averageScore}/100 |`,
    );
  }

  return lines.join('\n');
}

/**
 * Formats a percentage string.
 */
function percentage(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}
