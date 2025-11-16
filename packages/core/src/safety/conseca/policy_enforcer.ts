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

You are a security enforcement engine. Your job is to check if a tool call complies with a security policy.

Security Policy:
{{policy}}

Tool Call:
{{tool_call}}

Evaluate the tool call against the policy.
1. Check if the tool is allowed.
2. Check if the arguments match the constraints.
3. Output a JSON object with:
   - "decision": "ALLOW" or "DENY" or "ASK_USER"
   - "reason": A brief explanation.

Output strictly JSON.
`;

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
    debugLogger.debug(
      '[Conseca] Enforcement failed: Content generator not initialized',
    );
    return {
      decision: SafetyCheckDecision.DENY,
      reason: 'Content generator not initialized',
    };
  }

  const toolName = toolCall.name;
  debugLogger.debug(
    `[Conseca] Enforcing policy for tool: ${toolName}`,
    toolCall,
  );
  if (!toolName) {
    return {
      decision: SafetyCheckDecision.DENY,
      reason: 'Tool name is missing',
    };
  }

  // If the tool is not in the policy, we should probably DENY or ASK_USER.
  // Let's default to DENY for safety if not explicitly allowed/mentioned.
  // However, the policy generator might have omitted it if it wasn't relevant.
  // But for "yolo mode" safety, we want to check everything.
  // Let's assume the policy covers relevant tools. If missing, maybe ASK_USER?
  // For now, let's proceed to check with the LLM if we have a policy.

  const policyStr = JSON.stringify(policy[toolName] || {}, null, 2);
  const toolCallStr = JSON.stringify(toolCall, null, 2);
  debugLogger.debug(
    `[Conseca] Enforcing policy for tool: ${toolName}`,
    toolCall,
    policyStr,
    toolCallStr,
  );

  try {
    const result = await contentGenerator.generateContent(
      {
        model,
        config: {
          responseMimeType: 'application/json',
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
      'conseca-policy-enforcement',
    );

    const responseText = getResponseText(result);
    debugLogger.debug(`[Conseca] Enforcement Raw Response: ${responseText}`);

    if (!responseText) {
      debugLogger.debug(`[Conseca] Enforcement failed: Empty response`);
      return {
        decision: SafetyCheckDecision.DENY,
        reason: 'Empty response from enforcement model',
      };
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

    debugLogger.debug(`[Conseca] Enforcement Cleaned JSON: ${cleanText}`);
    const parsed = JSON.parse(cleanText);
    debugLogger.debug(`[Conseca] Enforcement Parsed:`, parsed);

    let decision: SafetyCheckDecision;
    switch (parsed.decision) {
      case 'ALLOW':
        decision = SafetyCheckDecision.ALLOW;
        break;
      case 'ASK_USER':
        decision = SafetyCheckDecision.ASK_USER;
        break;
      case 'DENY':
      default:
        decision = SafetyCheckDecision.DENY;
        break;
    }

    return {
      decision,
      reason: parsed.reason,
    };
  } catch (error) {
    debugLogger.debug(`[Conseca] Enforcement failed with error:`, error);
    return {
      decision: SafetyCheckDecision.DENY,
      reason: `Policy enforcement failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
