/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  GeminiClient,
  ToolCallData,
  ToolCallRequestInfo,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const RESTORABLE_TOOLS = new Set(['replace', 'write_file']);

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
  taskId: string,
): Promise<void> {
  console.log('Saving restorable tool call:', toolCall);
  if (!RESTORABLE_TOOLS.has(toolCall.name)) {
    return;
  }

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
  const filePath = path.join(checkpointDirPath, `checkpoint-${taskId}.json`);
  await fs.writeFile(filePath, JSON.stringify(toolCallData, null, 2));
  console.log('Checkpoint saved:', filePath);
}

export async function listCheckpointFiles(config: Config): Promise<string[]> {
  console.log('Listing checkpoint files...');
  const checkpointDirPath = getCheckpointDir(config);
  console.log('Checkpoint dir:', checkpointDirPath);
  await fs.mkdir(checkpointDirPath, { recursive: true });
  const files = await fs.readdir(checkpointDirPath);
  console.log('Checkpoint files:', files);
  return files.filter((file) => file.endsWith('.json'));
}

export async function readCheckpointData(
  config: Config,
  filename: string,
): Promise<ToolCallData> {
  console.log('Reading checkpoint data:', filename);
  const checkpointDirPath = getCheckpointDir(config);
  const filePath = path.join(checkpointDirPath, filename);
  const data = await fs.readFile(filePath, 'utf-8');
  console.log('Checkpoint data:', data);
  return JSON.parse(data) as ToolCallData;
}

export async function getCheckpointInfoList(
  config: Config,
): Promise<CheckpointInfo[]> {
  console.log('Getting checkpoint info list...');
  const jsonFiles = await listCheckpointFiles(config);
  const checkpointInfoList: CheckpointInfo[] = [];
  console.log('JSON files:', jsonFiles);

  for (const file of jsonFiles) {
    const toolCallData = await readCheckpointData(config, file);
    if (toolCallData.messageId) {
      checkpointInfoList.push({
        messageId: toolCallData.messageId,
        checkpointFile: file,
      });
    }
  }
  console.log('Checkpoint info list:', checkpointInfoList);
  return checkpointInfoList;
}

export async function getFormattedCheckpointList(
  config: Config,
): Promise<string> {
  console.log('Getting formatted checkpoint list...');
  const jsonFiles = await listCheckpointFiles(config);
  const truncatedFiles = jsonFiles.map((file) => {
    const components = file.split('.');
    if (components.length <= 1) {
      return file;
    }
    components.pop();
    return components.join('.');
  });
  console.log('Formatted checkpoint list:', truncatedFiles.join('\n'));
  return truncatedFiles.join('\n');
}
