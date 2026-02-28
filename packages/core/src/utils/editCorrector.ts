/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import { promptIdContext } from './promptIdContext.js';
import { debugLogger } from './debugLogger.js';
import { LRUCache } from 'mnemonist';
import { LlmRole } from '../telemetry/types.js';
import path from 'node:path';

const PYTHON_EXTENSIONS = new Set(['.py', '.pyw', '.pyi']);

function isPythonFile(filePath: string): boolean {
  return PYTHON_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

const CODE_CORRECTION_SYSTEM_PROMPT = `
You are an expert code-editing assistant. Your task is to analyze a failed edit attempt and provide a corrected version of the text snippets.
The correction should be as minimal as possible, staying very close to the original.
Focus ONLY on fixing issues like whitespace, indentation, line endings, or incorrect escaping.
Do NOT invent a completely new edit. Your job is to fix the provided parameters to make the edit succeed.
Return ONLY the corrected snippet in the specified JSON format.
`.trim();

function getPromptId(): string {
  return promptIdContext.getStore() ?? `edit-corrector-${Date.now()}`;
}

const MAX_CACHE_SIZE = 50;

// Cache for ensureCorrectFileContent results
const fileContentCorrectionCache = new LRUCache<string, string>(MAX_CACHE_SIZE);

export async function ensureCorrectFileContent(
  content: string,
  baseLlmClient: BaseLlmClient,
  abortSignal: AbortSignal,
  disableLLMCorrection: boolean = true,
  aggressiveUnescape: boolean = false,
  filePath?: string,
): Promise<string> {
  const cachedResult = fileContentCorrectionCache.get(content);
  if (cachedResult) {
    return cachedResult;
  }

  let correctedContent = content;

  // Apply Python-specific string literal repair for .py files
  if (filePath && isPythonFile(filePath)) {
    correctedContent = repairPythonStringLiterals(correctedContent);
  }

  const unescapedContent = unescapeStringForGeminiBug(correctedContent);
  if (unescapedContent === correctedContent && correctedContent === content) {
    fileContentCorrectionCache.set(content, content);
    return content;
  }

  if (unescapedContent !== correctedContent) {
    // There were escape issues to fix
    correctedContent = unescapedContent;
  }

  if (correctedContent !== content && disableLLMCorrection) {
    if (aggressiveUnescape) {
      fileContentCorrectionCache.set(content, correctedContent);
      return correctedContent;
    }
    // If the only changes were from Python repair (not unescape), still apply them
    const pythonRepaired = filePath && isPythonFile(filePath)
      ? repairPythonStringLiterals(content)
      : content;
    if (pythonRepaired !== content) {
      fileContentCorrectionCache.set(content, pythonRepaired);
      return pythonRepaired;
    }
    fileContentCorrectionCache.set(content, content);
    return content;
  }

  if (disableLLMCorrection) {
    fileContentCorrectionCache.set(content, correctedContent);
    return correctedContent;
  }

  const llmCorrected = await correctStringEscaping(
    correctedContent,
    baseLlmClient,
    abortSignal,
  );
  fileContentCorrectionCache.set(content, llmCorrected);
  return llmCorrected;
}
const CORRECT_STRING_ESCAPING_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    corrected_string_escaping: {
      type: 'string',
      description:
        'The string with corrected escaping, ensuring it is valid, specially considering potential over-escaping issues from previous LLM generations.',
    },
  },
  required: ['corrected_string_escaping'],
};

export async function correctStringEscaping(
  potentiallyProblematicString: string,
  baseLlmClient: BaseLlmClient,
  abortSignal: AbortSignal,
): Promise<string> {
  const prompt = `
Context: An LLM has just generated potentially_problematic_string and the text might have been improperly escaped (e.g. too many backslashes for newlines like \\n instead of \n, or unnecessarily quotes like \\"Hello\\" instead of "Hello").

potentially_problematic_string (this text MIGHT have bad escaping, or might be entirely correct):
\`\`\`
${potentiallyProblematicString}
\`\`\`

Task: Analyze the potentially_problematic_string. If it's syntactically invalid due to incorrect escaping (e.g., "\n", "\t", "\\", "\\'", "\\""), correct the invalid syntax. The goal is to ensure the text will be a valid and correctly interpreted.

For example, if potentially_problematic_string is "bar\\nbaz", the corrected_new_string_escaping should be "bar\nbaz".
If potentially_problematic_string is console.log(\\"Hello World\\"), it should be console.log("Hello World").

Return ONLY the corrected string in the specified JSON format with the key 'corrected_string_escaping'. If no escaping correction is needed, return the original potentially_problematic_string.
  `.trim();

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const result = await baseLlmClient.generateJson({
      modelConfigKey: { model: 'edit-corrector' },
      contents,
      schema: CORRECT_STRING_ESCAPING_SCHEMA,
      abortSignal,
      systemInstruction: CODE_CORRECTION_SYSTEM_PROMPT,
      promptId: getPromptId(),
      role: LlmRole.UTILITY_EDIT_CORRECTOR,
    });

    if (
      result &&
      typeof result['corrected_string_escaping'] === 'string' &&
      result['corrected_string_escaping'].length > 0
    ) {
      return result['corrected_string_escaping'];
    } else {
      return potentiallyProblematicString;
    }
  } catch (error) {
    if (abortSignal.aborted) {
      throw error;
    }

    debugLogger.warn(
      'Error during LLM call for string escaping correction:',
      error,
    );
    return potentiallyProblematicString;
  }
}

/**
 * Unescapes a string that might have been overly escaped by an LLM.
 */
export function unescapeStringForGeminiBug(inputString: string): string {
  // Regex explanation:
  // \\ : Matches exactly one literal backslash character.
  // (n|t|r|'|"|`|\\|\n) : This is a capturing group. It matches one of the following:
  //   n, t, r, ', ", ` : These match the literal characters 'n', 't', 'r', single quote, double quote, or backtick.
  //                       This handles cases like "\\n", "\\`", etc.
  //   \\ : This matches a literal backslash. This handles cases like "\\\\" (escaped backslash).
  //   \n : This matches an actual newline character. This handles cases where the input
  //        string might have something like "\\\n" (a literal backslash followed by a newline).
  // g : Global flag, to replace all occurrences.

  return inputString.replace(
    /\\+(n|t|r|'|"|`|\\|\n)/g,
    (match, capturedChar) => {
      // 'match' is the entire erroneous sequence, e.g., if the input (in memory) was "\\\\`", match is "\\\\`".
      // 'capturedChar' is the character that determines the true meaning, e.g., '`'.

      switch (capturedChar) {
        case 'n':
          return '\n'; // Correctly escaped: \n (newline character)
        case 't':
          return '\t'; // Correctly escaped: \t (tab character)
        case 'r':
          return '\r'; // Correctly escaped: \r (carriage return character)
        case "'":
          return "'"; // Correctly escaped: ' (apostrophe character)
        case '"':
          return '"'; // Correctly escaped: " (quotation mark character)
        case '`':
          return '`'; // Correctly escaped: ` (backtick character)
        case '\\': // This handles when 'capturedChar' is a literal backslash
          return '\\'; // Replace escaped backslash (e.g., "\\\\") with single backslash
        case '\n': // This handles when 'capturedChar' is an actual newline
          return '\n'; // Replace the whole erroneous sequence (e.g., "\\\n" in memory) with a clean newline
        default:
          // This fallback should ideally not be reached if the regex captures correctly.
          // It would return the original matched sequence if an unexpected character was captured.
          return match;
      }
    },
  );
}
export function repairPythonStringLiterals(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inTripleQuote: string | null = null; // tracks the triple-quote delimiter (''' or """)

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // If we're inside a triple-quoted string, just pass through until we find the closing delimiter
    if (inTripleQuote !== null) {
      result.push(line);
      if (line.includes(inTripleQuote)) {
        inTripleQuote = null;
      }
      i++;
      continue;
    }

    // Check if this line opens a triple-quoted string
    const tripleQuoteMatch = findOpeningTripleQuote(line);
    if (tripleQuoteMatch !== null) {
      result.push(line);
      // Check if the triple quote is also closed on the same line (after the opening)
      const afterOpening = line.slice(
        line.indexOf(tripleQuoteMatch, tripleQuoteMatch.length) + tripleQuoteMatch.length,
      );
      // A more robust check: count occurrences of the delimiter after the first one
      if (!hasUnmatchedTripleQuote(line, tripleQuoteMatch)) {
        // Triple quote is opened and closed on same line, not inside one
      } else {
        inTripleQuote = tripleQuoteMatch;
      }
      i++;
      continue;
    }

    // Check if this line has an unclosed single-line string literal
    const unclosedQuote = findUnclosedStringLiteral(line);
    if (unclosedQuote !== null && i + 1 < lines.length) {
      // The string literal is broken — rejoin with the next line using escaped \n
      // Keep joining lines until we find the closing quote or run out of lines
      let joined = line;
      let repaired = false;
      while (i + 1 < lines.length) {
        i++;
        const nextLine = lines[i];
        joined = joined + '\\n' + nextLine;

        if (!hasUnclosedQuote(joined, unclosedQuote)) {
          repaired = true;
          break;
        }
      }
      result.push(joined);
      if (!repaired) {
        // Could not repair — the file has other issues, leave it as-is
      }
    } else {
      result.push(line);
    }
    i++;
  }

  return result.join('\n');
}

/**
 * Checks if the line opens a triple-quoted string (''' or \"\"\").
 * Returns the delimiter if found, or null.
 */
function findOpeningTripleQuote(line: string): string | null {
  const stripped = stripPythonComment(line);
  // Look for triple quotes, skipping string prefixes (f, b, r, u, fr, rb, etc.)
  const tripleMatch = stripped.match(
    /(?:^|[^\\])(?:fr|rf|br|rb|[fFbBuUrR])?(\"{3}|'{3})/,
  );
  if (tripleMatch) {
    return tripleMatch[1];
  }
  return null;
}

/**
 * Checks if a triple-quote delimiter is opened but not closed on the same line.
 */
function hasUnmatchedTripleQuote(line: string, delimiter: string): boolean {
  const first = line.indexOf(delimiter);
  if (first === -1) return false;
  const second = line.indexOf(delimiter, first + delimiter.length);
  return second === -1;
}

/**
 * Finds an unclosed single-line string literal (single or double quote).
 * Returns the quote character if found, or null if all strings are properly closed.
 * Ignores triple-quoted strings and handles escaped quotes.
 */
function findUnclosedStringLiteral(line: string): string | null {
  const stripped = stripPythonComment(line);
  let inString: string | null = null;
  let i = 0;

  while (i < stripped.length) {
    const char = stripped[i];

    if (inString !== null) {
      if (char === '\\') {
        i += 2; // skip escaped character
        continue;
      }
      if (char === inString) {
        inString = null;
        i++;
        continue;
      }
    } else {
      // Not in a string — check for quote characters
      // Skip triple quotes (they're handled separately)
      if (
        (char === '"' || char === "'") &&
        stripped.substring(i, i + 3) === char.repeat(3)
      ) {
        // This is a triple quote — skip it entirely
        return null;
      }
      if (char === '"' || char === "'") {
        inString = char;
        i++;
        continue;
      }
    }
    i++;
  }

  return inString; // null if all closed, or the unclosed quote character
}

/**
 * Checks if a string has an unclosed quote of the given type.
 */
function hasUnclosedQuote(text: string, quote: string): boolean {
  return findUnclosedStringLiteral(text) === quote;
}

/**
 * Strips a Python-style # comment from a line (outside of string literals).
 */
function stripPythonComment(line: string): string {
  let inString: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inString !== null) {
      if (char === '\\') {
        i++; // skip escaped char
        continue;
      }
      if (char === inString) {
        inString = null;
      }
    } else {
      if (char === '#') {
        return line.substring(0, i);
      }
      if (char === '"' || char === "'") {
        // Check for triple-quote
        if (line.substring(i, i + 3) === char.repeat(3)) {
          // Find closing triple-quote
          const end = line.indexOf(char.repeat(3), i + 3);
          if (end !== -1) {
            i = end + 2; // skip past closing triple quote
            continue;
          }
          // No closing triple-quote on this line — rest is inside the string
          return line;
        }
        inString = char;
      }
    }
  }
  return line;
}

export function resetEditCorrectorCaches_TEST_ONLY() {
  fileContentCorrectionCache.clear();
}
