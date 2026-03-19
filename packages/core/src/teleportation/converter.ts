/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import type {
  ConversationRecord,
  ToolCallRecord,
  MessageRecord,
} from '../services/chatRecordingService.js';
import { CoreToolCallStatus } from '../scheduler/types.js';
import {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */

  EDIT_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  SHELL_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  ASK_USER_TOOL_NAME,
} from '../tools/definitions/coreTools.js';

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
      case 23: // CORTEX_STEP_TYPE_WRITE_TO_FILE
      case 'CORTEX_STEP_TYPE_WRITE_TO_FILE':
      case 25: // CORTEX_STEP_TYPE_FIND
      case 'CORTEX_STEP_TYPE_FIND':
      case 31: // CORTEX_STEP_TYPE_READ_URL_CONTENT
      case 'CORTEX_STEP_TYPE_READ_URL_CONTENT':
      case 33: // CORTEX_STEP_TYPE_SEARCH_WEB
      case 'CORTEX_STEP_TYPE_SEARCH_WEB':
      case 38: // CORTEX_STEP_TYPE_MCP_TOOL
      case 'CORTEX_STEP_TYPE_MCP_TOOL':
      case 85: // CORTEX_STEP_TYPE_BROWSER_SUBAGENT
      case 'CORTEX_STEP_TYPE_BROWSER_SUBAGENT':
      case 86: // CORTEX_STEP_TYPE_FILE_CHANGE
      case 'CORTEX_STEP_TYPE_FILE_CHANGE':
      case 140: // CORTEX_STEP_TYPE_GENERIC
      case 'CORTEX_STEP_TYPE_GENERIC': {
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
    name = READ_FILE_TOOL_NAME;
    args = { AbsolutePath: step['viewFile']['absolutePathUri'] };
    result = [{ text: step['viewFile']['content'] || '' }];
  } else if (step['listDirectory']) {
    name = LS_TOOL_NAME;
    args = { DirectoryPath: step['listDirectory']['directoryPathUri'] };
  } else if (step['grepSearch']) {
    name = GREP_TOOL_NAME;
    args = {
      Query: step['grepSearch']['query'],
      SearchPath: step['grepSearch']['searchPathUri'],
    };
    result = [{ text: step['grepSearch']['rawOutput'] || '' }];
  } else if (step['runCommand']) {
    name = SHELL_TOOL_NAME;
    args = { CommandLine: step['runCommand']['commandLine'] };
    result = [{ text: step['runCommand']['combinedOutput']?.['full'] || '' }];
  } else if (step['fileChange']) {
    name = EDIT_TOOL_NAME; // Or multi_replace_file_content
    args = { TargetFile: step['fileChange']['absolutePathUri'] };
  } else if (step['writeToFile']) {
    name = WRITE_FILE_TOOL_NAME;
    args = { TargetFile: step['writeToFile']['targetFileUri'] };
  } else if (step['find']) {
    name = GLOB_TOOL_NAME;
    args = {
      Pattern: step['find']['pattern'],
      SearchDirectory: step['find']['searchDirectory'],
    };
    result = [{ text: step['find']['truncatedOutput'] || '' }];
  } else if (step['readUrlContent']) {
    name = WEB_FETCH_TOOL_NAME;
    args = { Url: step['readUrlContent']['url'] };
    // We intentionally don't try fully mapping the complex KnowledgeBaseItem struct into a string here
    result = [{ text: 'successfully read url content' }];
  } else if (step['searchWeb']) {
    name = WEB_SEARCH_TOOL_NAME; // Usually mapped from 'searchWeb'
    args = { query: step['searchWeb']['query'] };
    if (step['searchWeb']['domain']) {
      args['domain'] = step['searchWeb']['domain'];
    }
    result = [{ text: 'successfully searched web' }];
  } else if (step['mcpTool']) {
    const mcpStep = step['mcpTool'];
    name = mcpStep['toolCall']?.['name'] || 'unknown_mcp_tool';
    try {
      if (mcpStep['toolCall']?.['arguments']) {
        args = JSON.parse(mcpStep['toolCall']['arguments']);
      }
    } catch {
      args = {};
    }
    result = [{ text: mcpStep['resultString'] || '' }];
  } else if (step['browserSubagent']) {
    name = 'browser_subagent';
    args = { Task: step['browserSubagent']['task'] };
  } else if (step['generic']) {
    const generic = step['generic'] as Record<string, unknown>;
    const rawName = generic['toolName'] as string;

    // Map generic tools to official CLI constants where applicable
    if (rawName === 'ask_user') {
      name = ASK_USER_TOOL_NAME;
    } else {
      name = rawName;
    }

    try {
      args = JSON.parse(generic['argsJson'] as string);
    } catch {
      args = {};
    }
    result = [{ text: (generic['responseJson'] as string) || '' }];
  }

  const safeArgs = args as Record<string, unknown>;
  const status =
    step['status'] === 3 || step['status'] === 'CORTEX_STEP_STATUS_DONE'
      ? CoreToolCallStatus.Success
      : CoreToolCallStatus.Error;

  // Synthesize a UI string from the args so it isn't blank in the terminal
  const argValues = Object.values(safeArgs)
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .join(', ');
  const description = argValues || '';

  // Synthesize a UI string for the result output
  let resultDisplay: string | undefined = undefined;
  if (Array.isArray(result) && result.length > 0) {
    const textParts = result
      .map((part) => part?.text)
      .filter((text) => typeof text === 'string' && text.length > 0);

    if (textParts.length > 0) {
      resultDisplay = textParts.join('\n');
    }
  }

  return {
    id,
    name,
    args: safeArgs,
    description,
    result,
    resultDisplay,
    status,
    timestamp,
  };
}
