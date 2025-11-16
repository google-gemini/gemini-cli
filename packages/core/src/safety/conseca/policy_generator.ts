/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getGeminiClient } from './utilities.js';
import type { SecurityPolicy } from './types.js';
import { getResponseText } from '../../utils/partUtils.js';
import { DEFAULT_GEMINI_FLASH_LITE_MODEL } from '../../config/models.js';
import { debugLogger } from '../../utils/debugLogger.js';

const CONSECA_POLICY_GENERATION_PROMPT = `
You are a security expert responsible for generating fine-grained security policies for a large language model integrated into a command-line tool. Your role is to act as a "policy generator" that creates temporary, context-specific rules based on a user's prompt and the tools available to the main LLM.

Your primary goal is to enforce the principle of least privilege. The policies you create should be as restrictive as possible while still allowing the main LLM to complete the user's requested task.

For each tool that is relevant to the user's prompt, you must generate a policy object.

### Output Format
You must return a JSON object where keys are tool names and values are objects with:
- "permissions": "ALLOW" | "DENY" | "ASK_USER"
- "constraints": A detailed description of conditions (e.g. allowed files, arguments).
- "rationale": Explanation for the policy.

Example JSON:
\`\`\`json
{
  "read_file": {
    "permissions": "ALLOW",
    "constraints": "Only allow reading 'main.py'.",
    "rationale": "User asked to read main.py"
  },
  "run_shell_command": {
    "permissions": "DENY",
    "constraints": "None",
    "rationale": "Shell commands are not needed for this task"
  }
}
\`\`\`

### Guiding Principles:
1.  **Permissions:**
    *   **ALLOW:** Required tools for the task. Read-only tools are generally safe.
    *   **DENY:** Tools clearly outside the scope.
    *   **ASK_USER:** Destructive actions or ambiguity.

2.  **Constraints:**
    *   Be specific! Restrict file paths, command arguments, etc.

3.  **Rationale:**
    *   Reference the user's prompt.
`;

/**
 * Generates a security policy for the given user prompt and trusted content.
 */
export async function generatePolicy(
  userPrompt: string,
  trustedContent: string,
): Promise<SecurityPolicy> {
  const model = DEFAULT_GEMINI_FLASH_LITE_MODEL;
  let client;
  try {
    client = await getGeminiClient(model);
  } catch (error) {
    console.error(
      'Failed to initialize Gemini client for policy generation:',
      error,
    );
    return {};
  }

  const prompt = `
User Prompt: "${userPrompt}"

Trusted Tools (Context):
${trustedContent}
`;

  try {
    const abortController = new AbortController();
    const result = await client.generateContent(
      { model },
      [
        {
          role: 'user',
          parts: [{ text: CONSECA_POLICY_GENERATION_PROMPT }, { text: prompt }],
        },
      ],
      abortController.signal,
    );

    const responseText = getResponseText(result);
    debugLogger.debug(`[Conseca] Policy Generation Raw Response: ${responseText}`);

    if (!responseText) {
      debugLogger.debug(`[Conseca] Policy Generation failed: Empty response`);
      return {};
    }

    let cleanText = responseText;
    // Extract JSON from code block if present
    const match = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      cleanText = match[1];
    } else {
      // Fallback: try to find the first '{' and last '}'
      const firstOpen = responseText.indexOf('{');
      const lastClose = responseText.lastIndexOf('}');
      if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
        cleanText = responseText.substring(firstOpen, lastClose + 1);
      }
    }
    
    debugLogger.debug(`[Conseca] Policy Generation Cleaned JSON: ${cleanText}`);

    try {
      const policy = JSON.parse(cleanText) as SecurityPolicy;
      debugLogger.debug(`[Conseca] Policy Generation Parsed:`, policy);
      return policy;
    } catch (parseError) {
      debugLogger.debug(`[Conseca] Policy Generation JSON Parse Error:`, parseError);
      return {};
    }
  } catch (error) {
    console.error('Policy generation failed:', error);
    return {};
  }
}
