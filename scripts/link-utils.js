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
  const patterns = [];
  const repo = repository?.trim();
  const keywordPrefix =
    '(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?|address(?:es|ed)?)\\s*(?:[:\\-=]|is)?\\s*';

  if (repo) {
    const escapedRepo = escapeForRegex(repo);
    patterns.push(new RegExp(`https://github\\.com/${escapedRepo}/issues/(\\d+)`, 'i'));
    patterns.push(new RegExp(`${escapedRepo}#(\\d+)`, 'i'));
    patterns.push(new RegExp(`${keywordPrefix}${escapedRepo}#(\\d+)`, 'i'));
    patterns.push(
      new RegExp(
        `${keywordPrefix}https://github\\.com/${escapedRepo}/issues/(\\d+)`,
        'i',
      ),
    );
  }

  patterns.push(new RegExp(`${keywordPrefix}issue\\s+#?(\\d+)`, 'i'));
  patterns.push(new RegExp(`${keywordPrefix}GH-(\\d+)`, 'i'));
  patterns.push(/(?:issue|bug)\s+#?(\d+)/i);
  patterns.push(/GH-(\d+)/i);
  patterns.push(/#(\d+)/);

  for (const pattern of patterns) {
    const match = search.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return '';
}
