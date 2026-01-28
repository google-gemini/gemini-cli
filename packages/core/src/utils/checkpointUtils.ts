/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import type { GitService } from '../services/gitService.js';
import type { GeminiClient } from '../core/client.js';
import { getErrorMessage } from './errors.js';
import { z } from 'zod';
import type { Content } from '@google/genai';
import type { ToolCallRequestInfo } from '../scheduler/types.js';

export interface ToolCallData<HistoryType = unknown, ArgsType = unknown> {
  history?: HistoryType;
  clientHistory?: Content[];
  commitHash?: string;
  toolCall: {
    name: string;
    args: ArgsType;
  };
  messageId?: string;
}

const ContentSchema = z
  .object({
    role: z.string().optional(),
    parts: z.array(z.record(z.unknown())),
  })
  .passthrough();

export function getToolCallDataSchema(historyItemSchema?: z.ZodTypeAny) {
  const schema = historyItemSchema ?? z.any();

  return z.object({
    history: z.array(schema).optional(),
    clientHistory: z.array(ContentSchema).optional(),
    commitHash: z.string().optional(),
    toolCall: z.object({
      name: z.string(),
      args: z.record(z.unknown()),
    }),
    messageId: z.string().optional(),
  });
}

export function generateCheckpointFileName(
  toolCall: ToolCallRequestInfo,
): string | null {
  const toolArgs = toolCall.args;
  const toolFilePath = toolArgs['file_path'] as string;

  if (!toolFilePath) {
    return null;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '_');
  const toolName = toolCall.name;
  const fileName = path.basename(toolFilePath);

  return `${timestamp}-${fileName}-${toolName}`;
}

export function formatCheckpointDisplayList(filenames: string[]): string {
  return getTruncatedCheckpointNames(filenames).join('\n');
}

export function getTruncatedCheckpointNames(filenames: string[]): string[] {
  return filenames.map((file) => {
    const components = file.split('.');
    if (components.length <= 1) {
      return file;
    }
    components.pop();
    return components.join('.');
  });
}

export async function processRestorableToolCalls<HistoryType>(
  toolCalls: ToolCallRequestInfo[],
  gitService: GitService,
  geminiClient: GeminiClient,
  history?: HistoryType,
): Promise<{
  checkpointsToWrite: Map<string, string>;
  toolCallToCheckpointMap: Map<string, string>;
  errors: string[];
}> {
  const checkpointsToWrite = new Map<string, string>();
  const toolCallToCheckpointMap = new Map<string, string>();
  const errors: string[] = [];

  for (const toolCall of toolCalls) {
    try {
      let commitHash: string | undefined;
      try {
        commitHash = await gitService.createFileSnapshot(
          `Snapshot for ${toolCall.name}`,
        );
      } catch (error) {
        errors.push(
          `Failed to create new snapshot for ${
            toolCall.name
          }: ${getErrorMessage(error)}. Attempting to use current commit.`,
        );
        commitHash = await gitService.getCurrentCommitHash();
      }

      if (!commitHash) {
        errors.push(
          `Failed to create snapshot for ${toolCall.name}. Checkpointing may not be working properly. Ensure Git is installed and the project directory is accessible.`,
        );
        continue;
      }

      const checkpointFileName = generateCheckpointFileName(toolCall);
      if (!checkpointFileName) {
        errors.push(
          `Skipping restorable tool call due to missing file_path: ${toolCall.name}`,
        );
        continue;
      }

      const clientHistory = geminiClient.getHistory();
      const checkpointData: ToolCallData<HistoryType> = {
        history,
        clientHistory,
        toolCall: {
          name: toolCall.name,
          args: toolCall.args,
        },
        commitHash,
        messageId: toolCall.prompt_id,
      };

      const fileName = `${checkpointFileName}.json`;
      checkpointsToWrite.set(fileName, JSON.stringify(checkpointData, null, 2));
      toolCallToCheckpointMap.set(
        toolCall.callId,
        fileName.replace('.json', ''),
      );
    } catch (error) {
      errors.push(
        `Failed to create checkpoint for ${toolCall.name}: ${getErrorMessage(
          error,
        )}`,
      );
    }
  }

  return { checkpointsToWrite, toolCallToCheckpointMap, errors };
}

export interface CheckpointInfo {
  messageId: string;
  checkpoint: string;
}

export function getCheckpointInfoList(
  checkpointFiles: Map<string, string>,
): CheckpointInfo[] {
  const checkpointInfoList: CheckpointInfo[] = [];

  for (const [file, content] of checkpointFiles) {
    try {
      const toolCallData = JSON.parse(content) as ToolCallData;
      if (toolCallData.messageId) {
        checkpointInfoList.push({
          messageId: toolCallData.messageId,
          checkpoint: file.replace('.json', ''),
        });
      }
    } catch (_e) {
      // Ignore invalid JSON files
    }
  }
  return checkpointInfoList;
}
