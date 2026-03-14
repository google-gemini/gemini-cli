/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sanitizes user input to prevent prompt injection attacks.
 *
 * This function escapes special sequences that Gemini CLI interprets,
 * as well as HTML-like characters that could be used for injection.
 *
 * SECURITY NOTE: The order of replacements is critical. Backslashes
 * must be escaped FIRST to prevent bypass attacks like:
 *   Input: \!{malicious}
 *   Without backslash escaping first: \!{malicious} (bypass!)
 *   With backslash escaping first: \\!{malicious} (safe)
 *
 * @param input - The raw user input to sanitize
 * @returns The sanitized input safe for Gemini CLI processing
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/\\/g, '\\\\') // MUST be first: escape backslashes
    .replace(/!{/g, '\\!{') // Escape Gemini CLI command execution
    .replace(/@{/g, '\\@{') // Escape Gemini CLI file inclusion
    .replace(/{{/g, '\\{{') // Escape Gemini CLI variable expansion
    .replace(/</g, '&lt;') // Escape HTML-like tags (security guideline)
    .replace(/>/g, '&gt;'); // Escape HTML-like tags (security guideline)
}
