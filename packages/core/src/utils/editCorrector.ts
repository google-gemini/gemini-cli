/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { GeminiClient } from '../core/client.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { EditToolParams } from '../tools/edit.js';
import {
  EDIT_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import {
  isFunctionResponse,
  isFunctionCall,
} from '../utils/messageInspectors.js';
import * as fs from 'node:fs';
import { promptIdContext } from './promptIdContext.js';
import { debugLogger } from './debugLogger.js';
import { LRUCache } from 'mnemonist';
import { LlmRole } from '../telemetry/types.js';

/**
 * Escapes triple backticks in untrusted input before embedding it in a
 * markdown code-fence inside an LLM prompt. Without this, input containing
 * ``` could break out of the fence and inject arbitrary prompt content.
 */
function sanitizeForPrompt(input: string): string {
  return input.replace(/```/g, '\\`\\`\\`');
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

// Cache for ensureCorrectEdit results
const editCorrectionCache = new LRUCache<string, CorrectedEditResult>(
  MAX_CACHE_SIZE,
);

// Cache for ensureCorrectFileContent results
const fileContentCorrectionCache = new LRUCache<string, string>(MAX_CACHE_SIZE);

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
 * Extracts the timestamp from the .id value, which is in format
 * <tool.name>-<timestamp>-<uuid>
 * @param fcnId the ID value of a functionCall or functionResponse object
 * @returns -1 if the timestamp could not be extracted, else the timestamp (as a number)
 */
function getTimestampFromFunctionId(fcnId: string): number {
  const idParts = fcnId.split('-');
  if (idParts.length > 2) {
    const timestamp = parseInt(idParts[1], 10);
    if (!isNaN(timestamp)) {
      return timestamp;
    }
  }
  return -1;
}

/**
 * Will look through the gemini client history and determine when the most recent
 * edit to a target file occurred. If no edit happened, it will return -1
 * @param filePath the path to the file
 * @param client the geminiClient, so that we can get the history
 * @returns a DateTime (as a number) of when the last edit occurred, or -1 if no edit was found.
 */
async function findLastEditTimestamp(
  filePath: string,
  client: GeminiClient,
): Promise<number> {
  const history = client.getHistory() ?? [];

  // Tools that may reference the file path in their FunctionResponse `output`.
  const toolsInResp = new Set([
    WRITE_FILE_TOOL_NAME,
    EDIT_TOOL_NAME,
    READ_MANY_FILES_TOOL_NAME,
    GREP_TOOL_NAME,
  ]);
  // Tools that may reference the file path in their FunctionCall `args`.
  const toolsInCall = new Set([...toolsInResp, READ_FILE_TOOL_NAME]);

  // Iterate backwards to find the most recent relevant action.
  for (const entry of history.slice().reverse()) {
    if (!entry.parts) continue;

    for (const part of entry.parts) {
      let id: string | undefined;
      let content: unknown;

      // Check for a relevant FunctionCall with the file path in its arguments.
      if (
        isFunctionCall(entry) &&
        part.functionCall?.name &&
        toolsInCall.has(part.functionCall.name)
      ) {
        id = part.functionCall.id;
        content = part.functionCall.args;
      }
      // Check for a relevant FunctionResponse with the file path in its output.
      else if (
        isFunctionResponse(entry) &&
        part.functionResponse?.name &&
        toolsInResp.has(part.functionResponse.name)
      ) {
        const { response } = part.functionResponse;
        if (response && !('error' in response) && 'output' in response) {
          id = part.functionResponse.id;
          content = response['output'];
        }
      }

      if (!id || content === undefined) continue;

      // Use the "blunt hammer" approach to find the file path in the content.
      // Note that the tool response data is inconsistent in their formatting
      // with successes and errors - so, we just check for the existence
      // as the best guess to if error/failed occurred with the response.
      const stringified = JSON.stringify(content);
      if (
        !stringified.includes('Error') && // only applicable for functionResponse
        !stringified.includes('Failed') && // only applicable for functionResponse
        stringified.includes(filePath)
      ) {
        return getTimestampFromFunctionId(id);
      }
    }
  }

  return -1;
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
  filePath: string,
  currentContent: string,
  originalParams: EditToolParams, // This is the EditToolParams from edit.ts, without 'corrected'
  geminiClient: GeminiClient,
  baseLlmClient: BaseLlmClient,
  abortSignal: AbortSignal,
  disableLLMCorrection: boolean,
): Promise<CorrectedEditResult> {
  const cacheKey = `${currentContent}---${originalParams.old_string}---${originalParams.new_string}`;
  const cachedResult = editCorrectionCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  let finalNewString = originalParams.new_string;

  const allowMultiple = originalParams.allow_multiple ?? false;

  let finalOldString = originalParams.old_string;
  let occurrences = countOccurrences(currentContent, finalOldString);

  const isOccurrencesMatch = allowMultiple
    ? occurrences > 0
    : occurrences === 1;

  if (isOccurrencesMatch) {
    // old_string matched the file content directly — no over-escaping detected.
    // new_string is therefore also likely correct as-is.
  } else if (occurrences > 1 && !allowMultiple) {
    // If user doesn't allow multiple but found multiple, return as-is (will fail validation later)
    const result: CorrectedEditResult = {
      params: { ...originalParams },
      occurrences,
    };
    editCorrectionCache.set(cacheKey, result);
    return result;
  } else {
    // occurrences is 0 — old_string doesn't match the file as-is.
    // Try unescaping: if the unescaped version matches, we have definitive
    // proof that the LLM over-escaped this generation.
    const unescapedOldStringAttempt = unescapeStringForGeminiBug(
      originalParams.old_string,
    );
    occurrences = countOccurrences(currentContent, unescapedOldStringAttempt);

    const isUnescapedOccurrencesMatch = allowMultiple
      ? occurrences > 0
      : occurrences === 1;

    if (isUnescapedOccurrencesMatch) {
      // Unescaped old_string matched — confirmed over-escaping.
      finalOldString = unescapedOldStringAttempt;

      // Since old_string was over-escaped, new_string from the same generation
      // needs the same treatment. Use LLM if available, otherwise apply the
      // same unescaping (we have confirmed context that this generation is
      // over-escaped).
      if (!disableLLMCorrection) {
        finalNewString = await correctNewString(
          baseLlmClient,
          originalParams.old_string, // original old
          unescapedOldStringAttempt, // corrected old
          originalParams.new_string, // original new (which is over-escaped)
          abortSignal,
        );
      } else {
        // LLM unavailable, but we KNOW over-escaping occurred (old_string
        // proved it). Apply the same unescaping to new_string.
        finalNewString = unescapeStringForGeminiBug(originalParams.new_string);
      }
    } else if (occurrences === 0) {
      if (filePath) {
        // In order to keep from clobbering edits made outside our system,
        // let's check if there was a more recent edit to the file than what
        // our system has done
        const lastEditedByUsTime = await findLastEditTimestamp(
          filePath,
          geminiClient,
        );

        // Add a 1-second buffer to account for timing inaccuracies. If the file
        // was modified more than a second after the last edit tool was run, we
        // can assume it was modified by something else.
        if (lastEditedByUsTime > 0) {
          const stats = fs.statSync(filePath);
          const diff = stats.mtimeMs - lastEditedByUsTime;
          if (diff > 2000) {
            // Hard coded for 2 seconds
            // This file was edited sooner
            const result: CorrectedEditResult = {
              params: { ...originalParams },
              occurrences: 0, // Explicitly 0 as LLM failed
            };
            editCorrectionCache.set(cacheKey, result);
            return result;
          }
        }
      }

      if (disableLLMCorrection) {
        const result: CorrectedEditResult = {
          params: { ...originalParams },
          occurrences: 0,
        };
        editCorrectionCache.set(cacheKey, result);
        return result;
      }

      const llmCorrectedOldString = await correctOldStringMismatch(
        baseLlmClient,
        currentContent,
        unescapedOldStringAttempt,
        abortSignal,
      );
      const llmOldOccurrences = countOccurrences(
        currentContent,
        llmCorrectedOldString,
      );

      const isLlmOccurrencesMatch = allowMultiple
        ? llmOldOccurrences > 0
        : llmOldOccurrences === 1;

      if (isLlmOccurrencesMatch) {
        finalOldString = llmCorrectedOldString;
        occurrences = llmOldOccurrences;

        // old_string needed LLM correction — it was over-escaped or otherwise
        // wrong. Apply unescaping to new_string as a starting point for LLM.
        const baseNewStringForLLMCorrection = unescapeStringForGeminiBug(
          originalParams.new_string,
        );
        finalNewString = await correctNewString(
          baseLlmClient,
          originalParams.old_string, // original old
          llmCorrectedOldString, // corrected old
          baseNewStringForLLMCorrection, // base new for correction
          abortSignal,
        );
      } else {
        // LLM correction also failed for old_string
        const result: CorrectedEditResult = {
          params: { ...originalParams },
          occurrences: 0, // Explicitly 0 as LLM failed
        };
        editCorrectionCache.set(cacheKey, result);
        return result;
      }
    } else {
      // Unescaping old_string resulted in > 1 occurrence but not allowMultiple
      const result: CorrectedEditResult = {
        params: { ...originalParams },
        occurrences, // This will be > 1
      };
      editCorrectionCache.set(cacheKey, result);
      return result;
    }
  }

  const { targetString, pair } = trimPairIfPossible(
    finalOldString,
    finalNewString,
    currentContent,
    allowMultiple,
  );
  finalOldString = targetString;
  finalNewString = pair;

  // Final result construction
  const result: CorrectedEditResult = {
    params: {
      file_path: originalParams.file_path,
      old_string: finalOldString,
      new_string: finalNewString,
    },
    occurrences: countOccurrences(currentContent, finalOldString), // Recalculate occurrences with the final old_string
  };
  editCorrectionCache.set(cacheKey, result);
  return result;
}

export async function ensureCorrectFileContent(
  content: string,
  baseLlmClient: BaseLlmClient,
  abortSignal: AbortSignal,
  disableLLMCorrection: boolean = true,
): Promise<string> {
  const cachedResult = fileContentCorrectionCache.get(content);
  if (cachedResult) {
    return cachedResult;
  }

  // For new file content there is no ground truth to compare against (unlike
  // old_string which can be validated against the existing file). Without
  // context we cannot distinguish over-escaped content from content that
  // legitimately contains backslash sequences (\title, \n in regexes, \" in
  // JSON, etc.).
  //
  // When the LLM is available, let it decide — it can use its understanding of
  // the target file format. When the LLM is not available, return the content
  // unchanged rather than risking silent corruption.

  if (disableLLMCorrection) {
    // No LLM and no ground truth — return content as-is.
    fileContentCorrectionCache.set(content, content);
    return content;
  }

  // Check if the content might be over-escaped before invoking the LLM.
  // unescapeStringForGeminiBug is used here purely as a cheap detection
  // probe — its result is discarded. The LLM makes the actual correction.
  const contentPotentiallyEscaped =
    unescapeStringForGeminiBug(content) !== content;
  if (!contentPotentiallyEscaped) {
    fileContentCorrectionCache.set(content, content);
    return content;
  }

  const correctedContent = await correctStringEscaping(
    content,
    baseLlmClient,
    abortSignal,
  );
  fileContentCorrectionCache.set(content, correctedContent);
  return correctedContent;
}

// Define the expected JSON schema for the LLM response for old_string correction
const OLD_STRING_CORRECTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    corrected_target_snippet: {
      type: 'string',
      description:
        'The corrected version of the target snippet that exactly and uniquely matches a segment within the provided file content.',
    },
  },
  required: ['corrected_target_snippet'],
};

export async function correctOldStringMismatch(
  baseLlmClient: BaseLlmClient,
  fileContent: string,
  problematicSnippet: string,
  abortSignal: AbortSignal,
): Promise<string> {
  const prompt = `
Context: A process needs to find an exact literal, unique match for a specific text snippet within a file's content. The provided snippet failed to match exactly. This is most likely because it has been overly escaped.

Task: Analyze the provided file content and the problematic target snippet. Identify the segment in the file content that the snippet was *most likely* intended to match. Output the *exact*, literal text of that segment from the file content. Focus *only* on removing extra escape characters and correcting formatting, whitespace, or minor differences to achieve a PERFECT literal match. The output must be the exact literal text as it appears in the file.

Problematic target snippet:
\`\`\`
${sanitizeForPrompt(problematicSnippet)}
\`\`\`

File Content:
\`\`\`
${sanitizeForPrompt(fileContent)}
\`\`\`

For example, if the problematic target snippet was "\\\\\\nconst greeting = \`Hello \\\\\`\${name}\\\\\`\`;" and the file content had content that looked like "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;", then corrected_target_snippet should likely be "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;" to fix the incorrect escaping to match the original file content.
If the differences are only in whitespace or formatting, apply similar whitespace/formatting changes to the corrected_target_snippet.

Return ONLY the corrected target snippet in the specified JSON format with the key 'corrected_target_snippet'. If no clear, unique match can be found, return an empty string for 'corrected_target_snippet'.
`.trim();

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const result = await baseLlmClient.generateJson({
      modelConfigKey: { model: 'edit-corrector' },
      contents,
      schema: OLD_STRING_CORRECTION_SCHEMA,
      abortSignal,
      systemInstruction: CODE_CORRECTION_SYSTEM_PROMPT,
      promptId: getPromptId(),
      role: LlmRole.UTILITY_EDIT_CORRECTOR,
    });

    if (
      result &&
      typeof result['corrected_target_snippet'] === 'string' &&
      result['corrected_target_snippet'].length > 0
    ) {
      return result['corrected_target_snippet'];
    } else {
      return problematicSnippet;
    }
  } catch (error) {
    if (abortSignal.aborted) {
      throw error;
    }

    debugLogger.warn(
      'Error during LLM call for old string snippet correction:',
      error,
    );

    return problematicSnippet;
  }
}

// Define the expected JSON schema for the new_string correction LLM response
const NEW_STRING_CORRECTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    corrected_new_string: {
      type: 'string',
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
  baseLlmClient: BaseLlmClient,
  originalOldString: string,
  correctedOldString: string,
  originalNewString: string,
  abortSignal: AbortSignal,
): Promise<string> {
  if (originalOldString === correctedOldString) {
    return originalNewString;
  }

  const prompt = `
Context: A text replacement operation was planned. The original text to be replaced (original_old_string) was slightly different from the actual text in the file (corrected_old_string). The original_old_string has now been corrected to match the file content.
We now need to adjust the replacement text (original_new_string) so that it makes sense as a replacement for the corrected_old_string, while preserving the original intent of the change.

original_old_string (what was initially intended to be found):
\`\`\`
${sanitizeForPrompt(originalOldString)}
\`\`\`

corrected_old_string (what was actually found in the file and will be replaced):
\`\`\`
${sanitizeForPrompt(correctedOldString)}
\`\`\`

original_new_string (what was intended to replace original_old_string):
\`\`\`
${sanitizeForPrompt(originalNewString)}
\`\`\`

Task: Based on the differences between original_old_string and corrected_old_string, and the content of original_new_string, generate a corrected_new_string. This corrected_new_string should be what original_new_string would have been if it was designed to replace corrected_old_string directly, while maintaining the spirit of the original transformation.

For example, if original_old_string was "\\\\\\nconst greeting = \`Hello \\\\\`\${name}\\\\\`\`;" and corrected_old_string is "\nconst greeting = \`Hello ${'\\`'}\${name}${'\\`'}\`;", and original_new_string was "\\\\\\nconst greeting = \`Hello \\\\\`\${name} \${lastName}\\\\\`\`;", then corrected_new_string should likely be "\nconst greeting = \`Hello ${'\\`'}\${name} \${lastName}${'\\`'}\`;" to fix the incorrect escaping.
If the differences are only in whitespace or formatting, apply similar whitespace/formatting changes to the corrected_new_string.

Return ONLY the corrected string in the specified JSON format with the key 'corrected_new_string'. If no adjustment is deemed necessary or possible, return the original_new_string.
  `.trim();

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const result = await baseLlmClient.generateJson({
      modelConfigKey: { model: 'edit-corrector' },
      contents,
      schema: NEW_STRING_CORRECTION_SCHEMA,
      abortSignal,
      systemInstruction: CODE_CORRECTION_SYSTEM_PROMPT,
      promptId: getPromptId(),
      role: LlmRole.UTILITY_EDIT_CORRECTOR,
    });

    if (
      result &&
      typeof result['corrected_new_string'] === 'string' &&
      result['corrected_new_string'].length > 0
    ) {
      return result['corrected_new_string'];
    } else {
      return originalNewString;
    }
  } catch (error) {
    if (abortSignal.aborted) {
      throw error;
    }

    debugLogger.warn('Error during LLM call for new_string correction:', error);
    return originalNewString;
  }
}

const CORRECT_NEW_STRING_ESCAPING_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    corrected_new_string_escaping: {
      type: 'string',
      description:
        'The new_string with corrected escaping, ensuring it is a proper replacement for the old_string, especially considering potential over-escaping issues from previous LLM generations.',
    },
  },
  required: ['corrected_new_string_escaping'],
};

export async function correctNewStringEscaping(
  baseLlmClient: BaseLlmClient,
  oldString: string,
  potentiallyProblematicNewString: string,
  abortSignal: AbortSignal,
): Promise<string> {
  const prompt = `
Context: A text replacement operation is planned. The text to be replaced (old_string) has been correctly identified in the file. However, the replacement text (new_string) might have been improperly escaped by a previous LLM generation (e.g. too many backslashes for newlines like \\n instead of \n, or unnecessarily quotes like \\"Hello\\" instead of "Hello").

old_string (this is the exact text that will be replaced):
\`\`\`
${sanitizeForPrompt(oldString)}
\`\`\`

potentially_problematic_new_string (this is the text that should replace old_string, but MIGHT have bad escaping, or might be entirely correct):
\`\`\`
${sanitizeForPrompt(potentiallyProblematicNewString)}
\`\`\`

Task: Analyze the potentially_problematic_new_string. If it's syntactically invalid due to incorrect escaping (e.g., "\n", "\t", "\\", "\\'", "\\""), correct the invalid syntax. The goal is to ensure the new_string, when inserted into the code, will be a valid and correctly interpreted.

For example, if old_string is "foo" and potentially_problematic_new_string is "bar\\nbaz", the corrected_new_string_escaping should be "bar\nbaz".
If potentially_problematic_new_string is console.log(\\"Hello World\\"), it should be console.log("Hello World").

Return ONLY the corrected string in the specified JSON format with the key 'corrected_new_string_escaping'. If no escaping correction is needed, return the original potentially_problematic_new_string.
  `.trim();

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const result = await baseLlmClient.generateJson({
      modelConfigKey: { model: 'edit-corrector' },
      contents,
      schema: CORRECT_NEW_STRING_ESCAPING_SCHEMA,
      abortSignal,
      systemInstruction: CODE_CORRECTION_SYSTEM_PROMPT,
      promptId: getPromptId(),
      role: LlmRole.UTILITY_EDIT_CORRECTOR,
    });

    if (
      result &&
      typeof result['corrected_new_string_escaping'] === 'string' &&
      result['corrected_new_string_escaping'].length > 0
    ) {
      return result['corrected_new_string_escaping'];
    } else {
      return potentiallyProblematicNewString;
    }
  } catch (error) {
    if (abortSignal.aborted) {
      throw error;
    }

    debugLogger.warn(
      'Error during LLM call for new_string escaping correction:',
      error,
    );
    return potentiallyProblematicNewString;
  }
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
${sanitizeForPrompt(potentiallyProblematicString)}
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

function trimPreservingTrailingNewline(str: string): string {
  const trimmedEnd = str.trimEnd();
  const trailingWhitespace = str.slice(trimmedEnd.length);
  const trailingNewlines = trailingWhitespace.replace(/[^\r\n]/g, '');
  return str.trim() + trailingNewlines;
}

function trimPairIfPossible(
  target: string,
  trimIfTargetTrims: string,
  currentContent: string,
  allowMultiple: boolean,
) {
  const trimmedTargetString = trimPreservingTrailingNewline(target);
  if (target.length !== trimmedTargetString.length) {
    const trimmedTargetOccurrences = countOccurrences(
      currentContent,
      trimmedTargetString,
    );

    const isMatch = allowMultiple
      ? trimmedTargetOccurrences > 0
      : trimmedTargetOccurrences === 1;

    if (isMatch) {
      const trimmedReactiveString =
        trimPreservingTrailingNewline(trimIfTargetTrims);
      return {
        targetString: trimmedTargetString,
        pair: trimmedReactiveString,
      };
    }
  }

  return {
    targetString: target,
    pair: trimIfTargetTrims,
  };
}

/**
 * Undoes one level of JSON-style backslash escaping from a string.
 *
 * The Gemini over-escaping bug: the LLM sometimes adds an extra level of
 * backslash escaping when generating JSON tool-call parameters. After the SDK
 * does JSON.parse, the resulting JS strings still contain literal escape
 * sequences (\n, \t, \", \\, etc.) where actual control/quote characters
 * were intended.
 *
 * This function strips exactly one backslash layer — it is equivalent to what
 * a second JSON.parse would do to string escape sequences. It does NOT try to
 * guess whether individual sequences are "intentional" or not, because that
 * requires knowledge of the target file format which this function does not
 * have.
 *
 * IMPORTANT — callers must gate usage of this function appropriately:
 *   • For old_string: safe to apply — result is validated against file content.
 *   • For new_string when old_string was over-escaped: safe — context proves
 *     the entire generation is over-escaped.
 *   • For detection probes: safe — just checks if unescaping changes anything.
 *   • For blind correction (no LLM, no validation target): callers should NOT
 *     apply this without confirmed context (e.g., old_string match).
 *
 * Only a single backslash is consumed per match (no greedy \\+), which
 * correctly preserves intentional multi-backslash sequences. For example,
 * \\n (double-backslash + n in memory) becomes \n (single-backslash + n)
 * rather than being collapsed to a bare newline.
 */
export function unescapeStringForGeminiBug(inputString: string): string {
  // Regex: match exactly one literal backslash followed by an escapable char.
  // Using \\ (not \\+) ensures we only strip one escaping level at a time.
  return inputString.replace(
    /\\(n|t|r|'|"|`|\\|\n)/g,
    (_match, capturedChar) => {
      switch (capturedChar) {
        case 'n':
          return '\n';
        case 't':
          return '\t';
        case 'r':
          return '\r';
        case "'":
          return "'";
        case '"':
          return '"';
        case '`':
          return '`';
        case '\\':
          return '\\'; // \\  →  \  (reduce double-backslash to single)
        case '\n':
          return '\n'; // \<actual newline>  →  <newline>
        default:
          return _match;
      }
    },
  );
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

export function resetEditCorrectorCaches_TEST_ONLY() {
  editCorrectionCache.clear();
  fileContentCorrectionCache.clear();
}
