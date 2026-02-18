/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../../config/config.js';
import type { SecurityPolicy } from './types.js';
import { getResponseText } from '../../utils/partUtils.js';
import { safeTemplateReplace } from '../../utils/textUtils.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../../config/models.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { SafetyCheckDecision } from '../protocol.js';

import { LlmRole } from '../../telemetry/index.js';

const CONSECA_POLICY_GENERATION_PROMPT = `
You are a security expert responsible for generating fine-grained security policies for a large language model integrated into a command-line tool. Your role is to act as a "policy generator" that creates temporary, context-specific rules based on a user's prompt and the tools available to the main LLM.

Your primary goal is to enforce the principle of least privilege. The policies you create should be as restrictive as possible while still allowing the main LLM to complete the user's requested task.

For each tool that is relevant to the user's prompt, you must generate a policy object.

### Output Format
You must return a JSON object with a "policies" key, which is an array of objects. Each object must have:
- "tool_name": The name of the tool.
- "policy": An object with:
  - "permissions": "allow" | "deny" | "ask_user"
  - "constraints": A detailed description of conditions (e.g. allowed files, arguments).
  - "rationale": Explanation for the policy.

Example JSON:
\`\`\`json
{
  "policies": [
    {
      "tool_name": "read_file",
      "policy": {
        "permissions": "allow",
        "constraints": "Only allow reading 'main.py'.",
        "rationale": "User asked to read main.py"
      }
    },
    {
      "tool_name": "run_shell_command",
      "policy": {
        "permissions": "deny",
        "constraints": "None",
        "rationale": "Shell commands are not needed for this task"
      }
    }
  ]
}
\`\`\`

### Guiding Principles:
1.  **Permissions:**
    *   **allow:** Required tools for the task.
    *   **deny:** Tools clearly outside the scope.
    *   **ask_user:** Destructive actions or ambiguity.

2.  **Constraints:**
    *   Be specific! Restrict file paths, command arguments, etc.

3.  **Rationale:**
    *   Reference the user's prompt.

User Prompt: "{{user_prompt}}"

Trusted Tools (Context):
{{trusted_content}}
`;

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const ToolPolicySchema = z.object({
  permissions: z.nativeEnum(SafetyCheckDecision),
  constraints: z.string(),
  rationale: z.string(),
});

const SecurityPolicyResponseSchema = z.object({
  policies: z.array(
    z.object({
      tool_name: z.string(),
      policy: ToolPolicySchema,
    }),
  ),
});

export interface PolicyGenerationResult {
  policy: SecurityPolicy;
  error?: string;
}

/**
 * Generates a security policy for the given user prompt and trusted content.
 */
export async function generatePolicy(
  userPrompt: string,
  trustedContent: string,
  config: Config,
): Promise<PolicyGenerationResult> {
  const model = DEFAULT_GEMINI_FLASH_MODEL;
  const contentGenerator = config.getContentGenerator();

  if (!contentGenerator) {
    return { policy: {}, error: 'Content generator not initialized' };
  }

  try {
    const result = await contentGenerator.generateContent(
      {
        model,
        config: {
          responseMimeType: 'application/json',
          responseSchema: zodToJsonSchema(SecurityPolicyResponseSchema, {
            target: 'openApi3',
          }),
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: safeTemplateReplace(CONSECA_POLICY_GENERATION_PROMPT, {
                  user_prompt: userPrompt,
                  trusted_content: trustedContent,
                }),
              },
            ],
          },
        ],
      },
      'conseca-policy-generation',
      LlmRole.SUBAGENT,
    );

    const responseText = getResponseText(result);
    debugLogger.debug(
      `[Conseca] Policy Generation Raw Response: ${responseText}`,
    );

    if (!responseText) {
      return { policy: {}, error: 'Empty response from policy generator' };
    }

    try {
      const parsed = SecurityPolicyResponseSchema.parse(
        JSON.parse(responseText),
      );
      const policiesList = parsed.policies;
      const policy: SecurityPolicy = {};
      for (const item of policiesList) {
        policy[item.tool_name] = item.policy;
      }

      debugLogger.debug(`[Conseca] Policy Generation Parsed:`, policy);
      return { policy };
    } catch (parseError) {
      debugLogger.debug(
        `[Conseca] Policy Generation JSON Parse Error:`,
        parseError,
      );
      return {
        policy: {},
        error: `JSON Parse Error: ${parseError instanceof Error ? parseError.message : String(parseError)}. Raw: ${responseText}`,
      };
    }
  } catch (error) {
    debugLogger.error('Policy generation failed:', error);
    return {
      policy: {},
      error: `Policy generation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
