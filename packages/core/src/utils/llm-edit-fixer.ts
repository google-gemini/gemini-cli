/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Content, Type } from '@google/genai';
import { type LlmUtilityService } from '../core/llmUtilityService.js';
import { LruCache } from './LruCache.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { promptIdContext } from './promptIdContext.js';

const MAX_CACHE_SIZE = 50;

const EDIT_SYS_PROMPT = `
You are an expert code-editing assistant specializing in debugging and correcting failed search-and-replace operations.

# Primary Goal
Your task is to analyze a failed edit attempt and provide a corrected \`search\` string that will match the text in the file precisely. The correction should be as minimal as possible, staying very close to the original, failed \`search\` string. Do NOT invent a completely new edit based on the instruction; your job is to fix the provided parameters.

It is important that you do no try to figure out if the instruction is correct. DO NOT GIVE ADVICE. Your only goal here is to do your best to perform the search and replace task! 

# Input Context
You will be given:
1. The high-level instruction for the original edit.
2. The exact \`search\` and \`replace\` strings that failed.
3. The error message that was produced.
4. The full content of the source file.

# Rules for Correction
1.  **Minimal Correction:** Your new \`search\` string must be a close variation of the original. Focus on fixing issues like whitespace, indentation, line endings, or small contextual differences.
2.  **Explain the Fix:** Your \`explanation\` MUST state exactly why the original \`search\` failed and how your new \`search\` string resolves that specific failure. (e.g., "The original search failed due to incorrect indentation; the new search corrects the indentation to match the source file.").
3.  **Preserve the \`replace\` String:** Do NOT modify the \`replace\` string unless the instruction explicitly requires it and it was the source of the error. Your primary focus is fixing the \`search\` string.
4.  **No Changes Case:** CRUCIAL: if the change is already present in the file,  set \`noChangesRequired\` to True and explain why in the \`explanation\`. It is crucial that you only do this if the changes outline in \`replace\` are alredy in the file and suits the instruction!! 
5.  **Exactness:** The final \`search\` field must be the EXACT literal text from the file. Do not escape characters.
`;

const EDIT_USER_PROMPT = `
# Goal of the Original Edit
<instruction>
{instruction}
</instruction>

# Failed Attempt Details
- **Original \`search\` parameter (failed):**
<search>
{old_string}
</search>
- **Original \`replace\` parameter:**
<replace>
{new_string}
</replace>
- **Error Encountered:**
<error>
{error}
</error>

# Full File Content
<file_content>
{current_content}
</file_content>

# Your Task
Based on the error and the file content, provide a corrected \`search\` string that will succeed. Remember to keep your correction minimal and explain the precise reason for the failure in your \`explanation\`.
`;

export interface SearchReplaceEdit {
  search: string;
  replace: string;
  noChangesRequired: boolean;
  explanation: string;
}

const SearchReplaceEditSchema = {
  type: Type.OBJECT,
  properties: {
    explanation: { type: Type.STRING },
    search: { type: Type.STRING },
    replace: { type: Type.STRING },
    noChangesRequired: { type: Type.BOOLEAN },
  },
  required: ['search', 'replace', 'explanation'],
};

const editCorrectionWithInstructionCache = new LruCache<
  string,
  SearchReplaceEdit
>(MAX_CACHE_SIZE);

/**
 * Attempts to fix a failed edit by using an LLM to generate a new search and replace pair.
 * @param instruction The instruction for what needs to be done.
 * @param old_string The original string to be replaced.
 * @param new_string The original replacement string.
 * @param error The error that occurred during the initial edit.
 * @param current_content The current content of the file.
 * @param llmUtilityService The LlmUtilityService to use for the LLM call.
 * @param abortSignal An abort signal to cancel the operation.
 * @param promptId A unique ID for the prompt.
 * @returns A new search and replace pair.
 */
export async function FixLLMEditWithInstruction(
  instruction: string,
  old_string: string,
  new_string: string,
  error: string,
  current_content: string,
  llmUtilityService: LlmUtilityService,
  abortSignal: AbortSignal,
): Promise<SearchReplaceEdit> {
  let promptId: string;
  const context = promptIdContext.getStore();
  if (!context) {
    promptId = `llm-fixer-fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    console.warn(
      `Could not find promptId in context. This is unexpected. Using a fallback ID: ${promptId}`,
    );
  } else {
    promptId = context.promptId;
  }

  const cacheKey = `${instruction}---${old_string}---${new_string}--${current_content}--${error}`;
  const cachedResult = editCorrectionWithInstructionCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }
  const userPrompt = EDIT_USER_PROMPT.replace('{instruction}', instruction)
    .replace('{old_string}', old_string)
    .replace('{new_string}', new_string)
    .replace('{error}', error)
    .replace('{current_content}', current_content);

  const contents: Content[] = [
    {
      role: 'user',
      parts: [{ text: userPrompt }],
    },
  ];

  const result = (await llmUtilityService.generateJson({
    contents,
    schema: SearchReplaceEditSchema,
    abortSignal,
    model: DEFAULT_GEMINI_FLASH_MODEL,
    systemInstruction: EDIT_SYS_PROMPT,
    promptId,
  })) as unknown as SearchReplaceEdit;

  editCorrectionWithInstructionCache.set(cacheKey, result);
  return result;
}

export function resetLlmEditFixerCaches_TEST_ONLY() {
  editCorrectionWithInstructionCache.clear();
}
