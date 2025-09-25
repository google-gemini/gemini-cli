/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Escape special characters in a string for use within a RegExp constructor.
 */
function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

const KEYWORD_PREFIX =
  '(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?|address(?:es|ed)?)\\s*(?:[:\\-=]|is)?\\s*';

const DEFAULT_TRANSFORM = (match) => match[1];

const FALLBACK_PATTERNS = [
  {
    regex: new RegExp(`${KEYWORD_PREFIX}issue\\s+#?(\\d+)`, 'i'),
    transform: DEFAULT_TRANSFORM,
  },
  {
    regex: new RegExp(`${KEYWORD_PREFIX}GH-(\\d+)`, 'i'),
    transform: DEFAULT_TRANSFORM,
  },
  {
    regex: new RegExp('(?:link|close[sd]?)\\s*(?:[:\\-=])?\\s*((?:t|T)[-\\s]?(\\d+))', 'i'),
    transform: (match) => `T-${match[2]}`,
  },
  {
    regex: new RegExp('(?:issue|bug)\\s+#?(\\d+)', 'i'),
    transform: DEFAULT_TRANSFORM,
  },
  {
    regex: new RegExp('GH-(\\d+)', 'i'),
    transform: DEFAULT_TRANSFORM,
  },
  {
    regex: new RegExp('#(\\d+)', 'i'),
    transform: DEFAULT_TRANSFORM,
  },
];

const REPO_PREFIXES = ['', KEYWORD_PREFIX];

const REPO_SUFFIX_BUILDERS = [
  (repo) => `https://github\\.com/${repo}/issues/(\\d+)`,
  (repo) => `${repo}#(\\d+)`,
];

const repoPatternCache = new Map();

/**
 * Attempt to find a linked issue reference within the provided text.
 *
 * @param {string} text - The text to search (e.g. PR title + body).
 * @param {string} repository - The "owner/repo" identifier for the repository.
 * @returns {string} The matched issue number, or an empty string if not found.
 */
export function findLinkedIssue(text, repository) {
  if (!text) {
    return '';
  }

  const search = `${text}`;

  const repo = repository?.trim();
  let patternsToSearch = FALLBACK_PATTERNS;

  if (repo) {
    let repoPatterns = repoPatternCache.get(repo);
    if (!repoPatterns) {
      const escapedRepo = escapeForRegex(repo);
      repoPatterns = REPO_PREFIXES.flatMap((prefix) =>
        REPO_SUFFIX_BUILDERS.map((suffixBuilder) => ({
          regex: new RegExp(`${prefix}${suffixBuilder(escapedRepo)}`, 'i'),
          transform: DEFAULT_TRANSFORM,
        })),
      );
      repoPatternCache.set(repo, repoPatterns);
    }

    patternsToSearch = [...repoPatterns, ...FALLBACK_PATTERNS];
  }

  for (const { regex, transform } of patternsToSearch) {
    const match = search.match(regex);
    if (match?.[1]) {
      const identifier = transform(match);
      if (identifier) {
        return identifier;
      }

    }
  }

  return '';
}
