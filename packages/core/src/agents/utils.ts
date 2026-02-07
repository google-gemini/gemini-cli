import { ReviewScore } from './types';

/**
 * Replaces placeholders in a template string with values from an input object.
 * Supports `${variable}` syntax.
 */
export function templateString(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\${(\w+)}/g, (match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : match;
  });
}

/**
 * Calculates the average confidence score from a set of reviews.
 */
export function calculateConsensusScore(scores: ReviewScore[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + s.confidence, 0);
  return sum / scores.length;
}

/**
 * Filters and flattens issues from reviews that meet a minimum confidence threshold.
 */
export function filterHighConfidenceIssues(
  scores: ReviewScore[],
  threshold: number
) {
  return scores
    .filter(s => s.confidence >= threshold)
    .flatMap(s => s.issues);
}
