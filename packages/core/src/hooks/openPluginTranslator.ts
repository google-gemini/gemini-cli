/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HookEventName, type HookOutput, type HookDecision } from './types.js';

/**
 * Maps Open Plugin standard event names to Gemini CLI hook event names.
 * Based on https://open-plugins.com/plugin-builders/specification#hooks
 */
export const OPEN_PLUGIN_EVENT_MAP: Record<string, HookEventName> = {
  onPrompt: HookEventName.BeforeAgent,
  onTool: HookEventName.BeforeTool,
  onModel: HookEventName.BeforeModel,
  onToolSelection: HookEventName.BeforeToolSelection,
  onNotification: HookEventName.Notification,
  onSessionStart: HookEventName.SessionStart,
  onSessionEnd: HookEventName.SessionEnd,
};

/**
 * Maps Gemini CLI internal event names back to Open Plugin standard event names.
 */
export const GEMINI_TO_OPEN_PLUGIN_EVENT_MAP: Record<HookEventName, string> = {
  [HookEventName.BeforeAgent]: 'onPrompt',
  [HookEventName.BeforeTool]: 'onTool',
  [HookEventName.BeforeModel]: 'onModel',
  [HookEventName.BeforeToolSelection]: 'onToolSelection',
  [HookEventName.Notification]: 'onNotification',
  [HookEventName.SessionStart]: 'onSessionStart',
  [HookEventName.SessionEnd]: 'onSessionEnd',
  [HookEventName.AfterAgent]: 'onPromptResponse', // Not standardized but common
  [HookEventName.AfterTool]: 'onToolResponse', // Not standardized but common
  [HookEventName.AfterModel]: 'onModelResponse', // Not standardized but common
  [HookEventName.PreCompress]: 'onPreCompress',
};

/**
 * Translates an Open Plugin hook response to Gemini CLI HookOutput.
 */
export function translateOpenPluginResponse(
  response: Record<string, unknown>,
): HookOutput {
  if (!response || typeof response !== 'object') {
    return { decision: 'allow' };
  }

  const output: HookOutput = {};

  // Map 'allow' boolean to 'decision' enum
  if (response['allow'] === false) {
    output.decision = 'block' as HookDecision;
  } else if (response['allow'] === true) {
    output.decision = 'allow' as HookDecision;
  }

  // Map 'reason' to 'reason'
  const reason = response['reason'];
  if (typeof reason === 'string') {
    output.reason = reason;
  }

  // Pass through other fields if present (e.g. tool_input, llm_request)
  output.hookSpecificOutput = response;

  return output;
}
