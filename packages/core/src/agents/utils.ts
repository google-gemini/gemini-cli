import { ReviewScore } from './types.js';

/**
 * Replaces placeholders in a template string with values from an input object.
 * Supports `${variable}` syntax. Throws an error if any required variable is missing.
 */
export function templateString(
  template: string,
  variables: Record<string, unknown>,
): string {
  const placeholderRegex = /\${(\w+)}/g;
  const requiredKeys = new Set(
    Array.from(template.matchAll(placeholderRegex), (match) => match[1]),
  );

  const missingKeys = Array.from(requiredKeys).filter(
    (key) => variables[key] === undefined,
  );

  if (missingKeys.length > 0) {
    throw new Error(
      `Template validation failed: Missing required input parameters: ${missingKeys.join(
        ', ',
      )}. Available inputs: ${Object.keys(variables).join(', ')}`,
    );
  }

  return template.replace(placeholderRegex, (_match, key) => {
    return String(variables[key]);
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
