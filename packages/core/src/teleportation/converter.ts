/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  type ConversationRecord,
  type MessageRecord,
  type ToolCallRecord,
} from '../services/chatRecordingService.js';
import { CoreToolCallStatus } from '../scheduler/types.js';

/**
 * Converts an Antigravity Trajectory JSON to a Gemini CLI ConversationRecord.
 */
export function convertAgyToCliRecord(agyJson: unknown): ConversationRecord {
  if (typeof agyJson !== 'object' || agyJson === null) {
    throw new Error('Invalid AGY JSON');
  }
  const json = agyJson as Record<string, unknown>;
  const messages: MessageRecord[] = [];
  const sessionId = (json['trajectoryId'] as string) || 'agy-session';
  const startTime = new Date().toISOString(); // Default to now if not found

  let currentGeminiMessage: (MessageRecord & { type: 'gemini' }) | null = null;

  const steps = (json['steps'] as any[]) || [];

  for (const step of steps) {
    const s = step as Record<string, unknown>;
    const metadata = s['metadata'] as Record<string, unknown> | undefined;
    const timestamp =
      (metadata?.['timestamp'] as string) || new Date().toISOString();
    const stepId =
      (metadata?.['stepId'] as string) ||
      Math.random().toString(36).substring(7);

    switch (s['type']) {
      case 14: // CORTEX_STEP_TYPE_USER_INPUT
      case 'CORTEX_STEP_TYPE_USER_INPUT': {
        // Close current Gemini message if open
        currentGeminiMessage = null;
        const userInput = s['userInput'] as Record<string, unknown> | undefined;
        messages.push({
          id: stepId,
          timestamp,
          type: 'user',
          content: [{ text: (userInput?.['userResponse'] as string) || '' }],
        });
        break;
      }

      case 15: // CORTEX_STEP_TYPE_PLANNER_RESPONSE
      case 'CORTEX_STEP_TYPE_PLANNER_RESPONSE': {
        const plannerResponse = s['plannerResponse'] as
          | Record<string, unknown>
          | undefined;
        const response = plannerResponse?.['response'] || '';
        const thinking = plannerResponse?.['thinking'] || '';
        currentGeminiMessage = {
          id: stepId,
          timestamp,
          type: 'gemini',
          content: [{ text: response as string }],
          thoughts: thinking
            ? [
                {
                  subject: 'Thinking',
                  description: thinking as string,
                  timestamp,
                },
              ]
            : [],
          toolCalls: [],
        };
        messages.push(currentGeminiMessage);
        break;
      }

      case 7: // CORTEX_STEP_TYPE_GREP_SEARCH
      case 'CORTEX_STEP_TYPE_GREP_SEARCH':
      case 8: // CORTEX_STEP_TYPE_VIEW_FILE
      case 'CORTEX_STEP_TYPE_VIEW_FILE':
      case 9: // CORTEX_STEP_TYPE_LIST_DIRECTORY
      case 'CORTEX_STEP_TYPE_LIST_DIRECTORY':
      case 21: // CORTEX_STEP_TYPE_RUN_COMMAND
      case 'CORTEX_STEP_TYPE_RUN_COMMAND':
      case 85: // CORTEX_STEP_TYPE_BROWSER_SUBAGENT
      case 'CORTEX_STEP_TYPE_BROWSER_SUBAGENT':
      case 86: // CORTEX_STEP_TYPE_FILE_CHANGE
      case 'CORTEX_STEP_TYPE_FILE_CHANGE': {
        if (!currentGeminiMessage) {
          // If no planner response preceded this, create a dummy one
          const adjunctMessage: MessageRecord = {
            id: `adjunct-${stepId}`,
            timestamp,
            type: 'gemini',
            content: [],
            toolCalls: [],
            thoughts: [],
          };
          messages.push(adjunctMessage);
          currentGeminiMessage = adjunctMessage as MessageRecord & {
            type: 'gemini';
          };
        }

        if (currentGeminiMessage) {
          currentGeminiMessage.toolCalls?.push(mapAgyStepToToolCall(s));
        }
        break;
      }

      default:
        // Skip unknown steps
        break;
    }
  }

  return {
    sessionId,
    projectHash: 'agy-imported',
    startTime,
    lastUpdated: new Date().toISOString(),
    messages,
  };
}

function mapAgyStepToToolCall(step: Record<string, any>): ToolCallRecord {
  const timestamp =
    (step['metadata']?.['timestamp'] as string) || new Date().toISOString();
  const id =
    (step['metadata']?.['stepId'] as string) ||
    Math.random().toString(36).substring(7);
  let name = 'unknown_tool';
  let args: any = {};
  let result: any = null;

  if (step['viewFile']) {
    name = 'view_file';
    args = { AbsolutePath: step['viewFile']['absolutePathUri'] };
    result = [{ text: step['viewFile']['content'] || '' }];
  } else if (step['listDirectory']) {
    name = 'list_dir';
    args = { DirectoryPath: step['listDirectory']['directoryPathUri'] };
  } else if (step['grepSearch']) {
    name = 'grep_search';
    args = {
      Query: step['grepSearch']['query'],
      SearchPath: step['grepSearch']['searchPathUri'],
    };
    result = [{ text: step['grepSearch']['rawOutput'] || '' }];
  } else if (step['runCommand']) {
    name = 'run_command';
    args = { CommandLine: step['runCommand']['commandLine'] };
    result = [{ text: step['runCommand']['combinedOutput']?.['full'] || '' }];
  } else if (step['fileChange']) {
    name = 'replace_file_content'; // Or multi_replace_file_content
    args = { TargetFile: step['fileChange']['absolutePathUri'] };
  } else if (step['browserSubagent']) {
    name = 'browser_subagent';
    args = { Task: step['browserSubagent']['task'] };
  } else if (step['generic']) {
    const generic = step['generic'] as Record<string, unknown>;
    name = generic['toolName'] as string;
    try {
      args = JSON.parse(generic['argsJson'] as string);
    } catch {
      args = {};
    }
    result = [{ text: (generic['responseJson'] as string) || '' }];
  }

  return {
    id,
    name,
    args: args as Record<string, unknown>,
    result,
    status:
      step['status'] === 3 || step['status'] === 'CORTEX_STEP_STATUS_DONE'
        ? CoreToolCallStatus.Success
        : CoreToolCallStatus.Error,
    timestamp,
  };
}
