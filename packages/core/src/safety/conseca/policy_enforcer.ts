/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getGeminiClient } from './utilities.js';
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

Output:
You must return a JSON object with the following fields:
-   "decision": One of "ALLOW", "DENY", or "ASK_USER".
-   "reason": A concise explanation of why the decision was made.

Rules:
-   If the policy explicitly allows the tool call with its arguments, return "ALLOW".
-   If the policy explicitly denies the tool call or its arguments, return "DENY".
-   If the policy requires user confirmation (e.g., "ASK_USER"), return "ASK_USER".
-   If the policy is ambiguous or does not cover the tool call, default to "DENY" for safety.
-   Be strict with argument constraints (e.g., file paths, commands).

Response Format:
\`\`\`json
{
  "decision": "ALLOW" | "DENY" | "ASK_USER",
  "reason": "..."
}
\`\`\`
`;

/**
 * Enforces the security policy on a tool call.
 */
export async function enforcePolicy(
  policy: SecurityPolicy,
  toolCall: FunctionCall,
): Promise<SafetyCheckResult> {
  const model = DEFAULT_GEMINI_FLASH_MODEL;
  let client;
  try {
    client = await getGeminiClient(model);
  } catch (error) {
    console.error(
      'Failed to initialize Gemini client for policy enforcement:',
      error,
    );
    // Fail open or closed? Protocol says we should probably fail closed (DENY) if we can't check.
    // But previous stub returned ALLOW.
    // The user said "default to DENY" in prompt rules.
    // If the *checker* is broken, we should probably DENY to be safe.
    return {
      decision: SafetyCheckDecision.DENY,
      reason: 'Internal error: Failed to initialize safety checker client.',
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
      reason: 'Tool name is missing.',
    };
  }

  const toolPolicy = policy[toolName];

  if (!toolPolicy) {
    // If no policy exists for this tool, we should probably DENY or ASK_USER by default.
    // For now, let's be safe and DENY if it's not explicitly in the policy map (assuming policy map covers all relevant tools).
    // However, if the policy map is partial, we might want to fallback to a general check.
    // Let's assume the policy generator should have generated a policy for it if it was relevant.
    // If it's not in the map, it might be an "unexpected" tool call.
    return {
      decision: SafetyCheckDecision.DENY,
      reason: `No security policy generated for tool '${toolName}'.`,
    };
  }

  const prompt = `
Security Policy for ${toolName}:
${JSON.stringify(toolPolicy, null, 2)}

Tool Call:
${JSON.stringify(toolCall, null, 2)}
`;

  try {
    const abortController = new AbortController();
    const result = await client.generateContent(
      { model },
      [
        {
          role: 'user',
          parts: [{ text: CONSECA_ENFORCEMENT_PROMPT }, { text: prompt }],
        },
      ],
      abortController.signal,
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
