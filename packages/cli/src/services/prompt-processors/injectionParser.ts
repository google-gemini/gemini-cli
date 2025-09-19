/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a single detected injection site in a prompt string.
 */
export interface Injection {
  /** The content extracted from within the braces (e.g., the command or path), trimmed. */
  content: string;
  /** The starting index of the injection (inclusive, points to the start of the trigger). */
  startIndex: number;
  /** The ending index of the injection (exclusive, points after the closing '}'). */
  endIndex: number;
}

/**
 * Iteratively parses a prompt string to extract injections (e.g., !{...} or @{...}),
 * correctly handling nested braces within the content.
 *
 * This parser relies on simple brace counting and does not support escaping.
 *
 * @param prompt The prompt string to parse.
 * @param trigger The opening trigger sequence (e.g., '!{', '@{').
 * @param contextName Optional context name (e.g., command name) for error messages.
 * @returns An array of extracted Injection objects.
 * @throws Error if an unclosed injection is found.
 */
export function extractInjections(
  prompt: string,
  trigger: string,
  contextName?: string,
): Injection[] {
  const injections: Injection[] = [];
  let index = 0;

  while (index < prompt.length) {
    const startIndex = prompt.indexOf(trigger, index);

    if (startIndex === -1) {
      break;
    }

    let currentIndex = startIndex + trigger.length;
    let braceCount = 1;
    let foundEnd = false;

    while (currentIndex < prompt.length) {
      const char = prompt[currentIndex];

      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          const injectionContent = prompt.substring(
            startIndex + trigger.length,
            currentIndex,
          );
          const endIndex = currentIndex + 1;

          injections.push({
            content: injectionContent.trim(),
            startIndex,
            endIndex,
          });

          index = endIndex;
          foundEnd = true;
          break;
        }
      }
      currentIndex++;
    }

    // Check if the inner loop finished without finding the closing brace.
    if (!foundEnd) {
      const contextInfo = contextName ? ` in command '${contextName}'` : '';
      // Enforce strict parsing (Comment 1) and clarify limitations (Comment 2).
      throw new Error(
        `Invalid syntax${contextInfo}: Unclosed injection starting at index ${startIndex} ('${trigger}'). Ensure braces are balanced. Paths or commands with unbalanced braces are not supported directly.`,
      );
    }
  }

  return injections;
}
