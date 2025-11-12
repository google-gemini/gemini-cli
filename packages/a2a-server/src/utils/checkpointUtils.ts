/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Config,
  GeminiClient,
  ToolCallData,
  ToolCallRequestInfo,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface CheckpointInfo {
  messageId: string;
  checkpointFile: string;
}

let checkpointDirPath: string;

function getCheckpointDir(config: Config): string {
  if (!checkpointDirPath) {
    checkpointDirPath = config.storage.getProjectTempCheckpointsDir();
  }
  return checkpointDirPath;
}

export async function saveRestorableToolCall(
  toolCall: ToolCallRequestInfo,
  config: Config,
  geminiClient: GeminiClient,
): Promise<string | undefined> {
  const gitService = await config.getGitService();
  if (!gitService) {
    return;
  }

  const commitHash = await gitService.createFileSnapshot(
    `Checkpoint created before executing tool: ${toolCall.name}`,
  );
  const clientHistory = geminiClient.getHistory();

  const toolCallData: ToolCallData = {
    toolCall: {
      name: toolCall.name,
      args: toolCall.args,
    },
    commitHash,
    clientHistory,
    messageId: toolCall.prompt_id,
  };

  const checkpointDirPath = getCheckpointDir(config);
  await fs.mkdir(checkpointDirPath, { recursive: true });
  const fileName = `checkpoint-${uuidv4()}.json`;
  const filePath = path.join(checkpointDirPath, fileName);
  await fs.writeFile(filePath, JSON.stringify(toolCallData, null, 2));
  return fileName;
}

export async function listCheckpointFiles(config: Config): Promise<string[]> {
  const checkpointDirPath = getCheckpointDir(config);
  await fs.mkdir(checkpointDirPath, { recursive: true });
  const files = await fs.readdir(checkpointDirPath);
  return files.filter((file) => file.endsWith('.json'));
}

export async function readCheckpointData(
  config: Config,
  filename: string,
): Promise<ToolCallData> {
  const checkpointDirPath = getCheckpointDir(config);
  const filePath = path.join(checkpointDirPath, filename);
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data) as ToolCallData;
}

export async function getCheckpointInfoList(
  config: Config,
): Promise<CheckpointInfo[]> {
  const jsonFiles = await listCheckpointFiles(config);
  const checkpointInfoList: CheckpointInfo[] = [];

  for (const file of jsonFiles) {
    const toolCallData = await readCheckpointData(config, file);
    if (toolCallData.messageId) {
      checkpointInfoList.push({
        messageId: toolCallData.messageId,
        checkpointFile: file,
      });
    }
  }
  return checkpointInfoList;
}

export async function getFormattedCheckpointList(
  config: Config,
): Promise<string> {
  const jsonFiles = await listCheckpointFiles(config);
  const truncatedFiles = jsonFiles.map((file) => {
    const components = file.split('.');
    if (components.length <= 1) {
      return file;
    }
    components.pop();
    return components.join('.');
  });
  return truncatedFiles.join('\n');
}
