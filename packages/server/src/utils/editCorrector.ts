/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  GenerateContentConfig,
  SchemaUnion,
  Type,
} from '@google/genai';
import { GeminiClient } from '../core/client.js';
import { EditToolParams } from '../tools/edit.js';

const EditModel = 'gemini-2.5-flash-preview-04-17';
const EditConfig: GenerateContentConfig = {
  thinkingConfig: {
    thinkingBudget: 0,
  },
};

/**
 * Defines the structure of the parameters within CorrectedEditResult
 */
interface CorrectedEditParams {
  file_path: string;
  old_string: string;
  new_string: string;
}

/**
 * Defines the result structure for ensureCorrectEdit.
 */
export interface CorrectedEditResult {
  params: CorrectedEditParams;
  occurrences: number;
}

/**
 * Attempts to correct edit parameters if the original old_string is not found.
 * It tries unescaping, and then LLM-based correction.
 * Results are cached to avoid redundant processing.
 *
 * @param currentContent The current content of the file.
 * @param originalParams The original EditToolParams
 * @param client The GeminiClient for LLM calls.
 * @returns A promise resolving to an object containing the (potentially corrected)
 *          EditToolParams (as CorrectedEditParams) and the final occurrences count.
 */
export async function ensureCorrectEdit(
  currentContent: string,
  originalParams: EditToolParams, // This is the EditToolParams from edit.ts, without \'corrected\'
  client: GeminiClient,
): Promise<CorrectedEditResult> {
  let finalNewString = originalParams.new_string;
  const newStringPotentiallyEscaped =
    unescapeStringForGeminiBug(originalParams.new_string) !==
    originalParams.new_string;

  let finalOldString = originalParams.old_string;
  let occurrences = countOccurrences(currentContent, finalOldString);

  if (occurrences === 1) {
    return { params: originalParams, occurrences };
  } else {
    // occurrences is 0 or some other unexpected state initially
    const unescapedOldStringAttempt = unescapeStringForGeminiBug(
      originalParams.old_string,
    );
    occurrences = countOccurrences(currentContent, unescapedOldStringAttempt);

    if (occurrences === 1) {
      finalOldString = unescapedOldStringAttempt;
      finalNewString = unescapeStringForGeminiBug(originalParams.new_string);
    } else if (occurrences === 0) {
      const llmCorrectedOldString = await correctOldStringMismatch(
        client,
        currentContent,
        unescapedOldStringAttempt,
      );
      const llmOldOccurrences = countOccurrences(
        currentContent,
        llmCorrectedOldString,
      );

      if (llmOldOccurrences === 1) {
        finalOldString = llmCorrectedOldString;
        occurrences = llmOldOccurrences;

        if (newStringPotentiallyEscaped) {
          const baseNewStringForLLMCorrection = unescapeStringForGeminiBug(
            originalParams.new_string,
          );
          finalNewString = await correctNewString(
            client,
            originalParams.old_string, // original old
            llmCorrectedOldString, // corrected old
            baseNewStringForLLMCorrection, // base new for correction
          );
        }
      } else {
        // LLM correction also failed for old_string
        const result: CorrectedEditResult = {
          params: { ...originalParams },
          occurrences: 0, // Explicitly 0 as LLM failed
        };
        return result;
      }
    } else {
      // Unescaping old_string resulted in > 1 occurrences
      const result: CorrectedEditResult = {
        params: { ...originalParams },
        occurrences, // This will be > 1
      };
      return result;
    }
  }

  // Final result construction
  const result: CorrectedEditResult = {
    params: {
      file_path: originalParams.file_path,
      old_string: finalOldString,
      new_string: finalNewString,
    },
    occurrences: countOccurrences(currentContent, finalOldString), // Recalculate occurrences with the final old_string
  };
  return result;
}

// Define the expected JSON schema for the LLM response for old_string correction
const OLD_STRING_CORRECTION_SCHEMA: SchemaUnion = {
  type: Type.OBJECT,
  properties: {
    corrected_target_snippet: {
      type: Type.STRING,
      description:
        'The corrected version of the target snippet that exactly and uniquely matches a segment within the provided file content.',
    },
  },
  required: ['corrected_target_snippet'],
};

export async function correctOldStringMismatch(
  geminiClient: GeminiClient,
  fileContent: string,
  problematicSnippet: string,
): Promise<string> {
  const prompt = `
Context: A process needs to find an exact literal, unique match for a specific text snippet within a file's content. The provided snippet failed to match exactly. This is most likely because it has been overly escaped.

Task: Analyze the provided file content and the problematic target snippet. Identify the segment in the file content that the snippet was *most likely* intended to match. Output the *exact*, literal text of that segment from the file content. Focus *only* on removing extra escape characters and correcting formatting, whitespace, or minor differences to achieve a PERFECT literal match. The output must be the exact literal text as it appears in the file.

Problematic target snippet:
\`\`\`
${problematicSnippet}
\`\`\`

File Content:
\`\`\`
${fileContent}
\`\`\`

For example, if the problematic target snippet was "\\\\\\nconst greeting = \`Hello \\\\\`\${name}\\\\\`\`;" and the file content had content that looked like "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;", then corrected_target_snippet should likely be "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;" to fix the incorrect escaping to match the original file content.
If the differences are only in whitespace or formatting, apply similar whitespace/formatting changes to the corrected_target_snippet.

Return ONLY the corrected target snippet in the specified JSON format with the key 'corrected_target_snippet'. If no clear, unique match can be found, return an empty string for 'corrected_target_snippet'.
`.trim();

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const result = await geminiClient.generateJson(
      contents,
      OLD_STRING_CORRECTION_SCHEMA,
      EditModel,
      EditConfig,
    );

    if (
      result &&
      typeof result.corrected_target_snippet === 'string' &&
      result.corrected_target_snippet.length > 0
    ) {
      return result.corrected_target_snippet;
    } else {
      return problematicSnippet;
    }
  } catch (error) {
    console.error(
      'Error during LLM call for old string snippet correction:',
      error,
    );
    return problematicSnippet;
  }
}

// Define the expected JSON schema for the new_string correction LLM response
const NEW_STRING_CORRECTION_SCHEMA: SchemaUnion = {
  type: Type.OBJECT,
  properties: {
    corrected_new_string: {
      type: Type.STRING,
      description:
        'The original_new_string adjusted to be a suitable replacement for the corrected_old_string, while maintaining the original intent of the change.',
    },
  },
  required: ['corrected_new_string'],
};

/**
 * Adjusts the new_string to align with a corrected old_string, maintaining the original intent.
 */
export async function correctNewString(
  geminiClient: GeminiClient,
  originalOldString: string,
  correctedOldString: string,
  originalNewString: string,
): Promise<string> {
  if (originalOldString === correctedOldString) {
    return originalNewString;
  }

  const prompt = `
Context: A text replacement operation was planned. The original text to be replaced (original_old_string) was slightly different from the actual text in the file (corrected_old_string). The original_old_string has now been corrected to match the file content.
We now need to adjust the replacement text (original_new_string) so that it makes sense as a replacement for the corrected_old_string, while preserving the original intent of the change.

original_old_string (what was initially intended to be found):
\`\`\`
${originalOldString}
\`\`\`

corrected_old_string (what was actually found in the file and will be replaced):
\`\`\`
${correctedOldString}
\`\`\`

original_new_string (what was intended to replace original_old_string):
\`\`\`
${originalNewString}
\`\`\`

Task: Based on the differences between original_old_string and corrected_old_string, and the content of original_new_string, generate a corrected_new_string. This corrected_new_string should be what original_new_string would have been if it was designed to replace corrected_old_string directly, while maintaining the spirit of the original transformation.

For example, if original_old_string was "\\\\\\nconst greeting = \`Hello \\\\\`\${name}\\\\\`\`;" and corrected_old_string is "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;", and original_new_string was "\\\\\\nconst greeting = \`Hello \\\\\`\${name} \${lastName}\\\\\`\`;", then corrected_new_string should likely be "\nconst greeting = \`Hello ${'\\`'}\${name} \${lastName}${'\\`'}\`;" to fix the incorrect escaping.
If the differences are only in whitespace or formatting, apply similar whitespace/formatting changes to the corrected_new_string.

Return ONLY the corrected string in the specified JSON format with the key 'corrected_new_string'. If no adjustment is deemed necessary or possible, return the original_new_string.
  `.trim();

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const result = await geminiClient.generateJson(
      contents,
      NEW_STRING_CORRECTION_SCHEMA,
      EditModel,
      EditConfig,
    );

    if (
      result &&
      typeof result.corrected_new_string === 'string' &&
      result.corrected_new_string.length > 0
    ) {
      return result.corrected_new_string;
    } else {
      return originalNewString;
    }
  } catch (error) {
    console.error('Error during LLM call for new_string correction:', error);
    return originalNewString;
  }
}

/**
 * Unescapes a string that might have been overly escaped by an LLM.
 */
export function unescapeStringForGeminiBug(inputString: string): string {
  // Regex explanation:
  // \\+ : Matches one or more literal backslash characters.
  // (n|t|r|'|"|`|\n) : This is a capturing group. It matches one of the following:
  //   n, t, r, ', ", ` : These match the literal characters 'n', 't', 'r', single quote, double quote, or backtick.
  //                       This handles cases like "\\n", "\\\\`", etc.
  //   \n                 : This matches an actual newline character. This handles cases where the input
  //                       string might have something like "\\\n" (a literal backslash followed by a newline).
  // g : Global flag, to replace all occurrences.

  return inputString.replace(/\\+(n|t|r|'|"|`|\n)/g, (match, capturedChar) => {
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
      case '\n': // This handles when 'capturedChar' is an actual newline
        return '\n'; // Replace the whole erroneous sequence (e.g., "\\\n" in memory) with a clean newline
      default:
        // This fallback should ideally not be reached if the regex captures correctly.
        // It would return the original matched sequence if an unexpected character was captured.
        return match;
    }
  });
}

/**
 * Counts occurrences of a substring in a string
 */
export function countOccurrences(str: string, substr: string): number {
  if (substr === '') {
    return 0;
  }
  let count = 0;
  let pos = str.indexOf(substr);
  while (pos !== -1) {
    count++;
    pos = str.indexOf(substr, pos + substr.length); // Start search after the current match
  }
  return count;
}
