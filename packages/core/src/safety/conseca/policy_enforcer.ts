/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../../config/config.js';
import type { FunctionCall } from '@google/genai';
import { SafetyCheckDecision, type SafetyCheckResult } from '../protocol.js';
import type { SecurityPolicy } from './types.js';
import { getResponseText } from '../../utils/partUtils.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../../config/models.js';
import { debugLogger } from '../../utils/debugLogger.js';

const CONSECA_ENFORCEMENT_PROMPT = `
You are a security enforcement engine. Your goal is to check if a specific tool call complies with a given security policy.

Input:
1.  **Security Policy:** A set of rules defining allowed and denied actions for this specific tool.
2.  **Tool Call:** The actual function call the system intends to execute.

Security Policy:
{{policy}}

Tool Call:
{{tool_call}}

Evaluate the tool call against the policy.
1. Check if the tool is allowed.
2. Check if the arguments match the constraints.
3. Output a JSON object with:
   - "decision": "allow", "deny", or "ask_user".
   - "reason": A brief explanation.

Output strictly JSON.
`;

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Schema } from '@google/genai';

const EnforcementResultSchema = z.object({
  decision: z.enum(['allow', 'deny', 'ask_user']),
  reason: z.string(),
});

/**
 * Enforces the security policy for a given tool call.
 */
export async function enforcePolicy(
  policy: SecurityPolicy,
  toolCall: FunctionCall,
  config: Config,
): Promise<SafetyCheckResult> {
  const model = DEFAULT_GEMINI_FLASH_MODEL;
  const contentGenerator = config.getContentGenerator();

  if (!contentGenerator) {
    return {
      decision: SafetyCheckDecision.ALLOW,
      reason: 'Content generator not initialized',
      error: 'Content generator not initialized',
    };
  }

  const toolName = toolCall.name;
  if (!toolName) {
    return {
      decision: SafetyCheckDecision.ALLOW,
      reason: 'Tool name is missing',
      error: 'Tool name is missing',
    };
  }

  const policyStr = JSON.stringify(policy[toolName] || {}, null, 2);
  const toolCallStr = JSON.stringify(toolCall, null, 2);
  debugLogger.debug(
    `[Conseca] Enforcing policy for tool: ${toolName}`,
    toolCall,
    policyStr,
    toolCallStr,
  );

  if (!policyStr) {
    return {
      decision: SafetyCheckDecision.ALLOW,
      reason: 'Policy for tool ' + toolName + ' is missing',
      error: 'Policy for tool ' + toolName + ' is missing',
    };
  }

  try {
    const result = await contentGenerator.generateContent(
      {
        model,
        config: {
          responseMimeType: 'application/json',
          responseSchema: zodToJsonSchema(EnforcementResultSchema, {
            target: 'openApi3',
          }) as unknown as Schema,
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: CONSECA_ENFORCEMENT_PROMPT.replace(
                  '{{policy}}',
                  policyStr,
                ).replace('{{tool_call}}', toolCallStr),
              },
            ],
          },
        ],
      },
      'conseca-enforcement',
    );

    const responseText = getResponseText(result);
    debugLogger.debug(`[Conseca] Enforcement Raw Response: ${responseText}`);

    if (!responseText) {
      return {
        decision: SafetyCheckDecision.ALLOW,
        reason: 'Empty response from policy enforcer',
        error: 'Empty response from policy enforcer',
      };
    }

    try {
      const parsed = JSON.parse(responseText);
      debugLogger.debug(`[Conseca] Enforcement Parsed:`, parsed);

      let decision: SafetyCheckDecision;
      switch (parsed.decision) {
        case 'allow':
          decision = SafetyCheckDecision.ALLOW;
          break;
        case 'ask_user':
          decision = SafetyCheckDecision.ASK_USER;
          break;
        case 'deny':
        default:
          decision = SafetyCheckDecision.DENY;
          break;
      }

      return {
        decision,
        reason: parsed.reason,
      };
    } catch (parseError) {
      return {
        decision: SafetyCheckDecision.ALLOW,
        reason: 'JSON Parse Error in enforcement response',
        error: `JSON Parse Error: ${parseError instanceof Error ? parseError.message : String(parseError)}. Raw: ${responseText}`,
      };
    }
  } catch (error) {
    debugLogger.error('Policy enforcement failed:', error);
    return {
      decision: SafetyCheckDecision.ALLOW,
      reason: 'Policy enforcement failed',
      error: `Policy enforcement failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
