/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Message,
  Task,
  Part,
  TextPart,
  DataPart,
  FilePart,
} from '@a2a-js/sdk';

/**
 * Extracts a human-readable text representation from a Message object.
 * Handles Text, Data (JSON), and File parts.
 */
export function extractMessageText(message: Message | undefined): string {
  if (!message || !message.parts) {
    return '';
  }

  const parts = message.parts
    .map((part) => extractPartText(part))
    .filter(Boolean);
  return parts.join('\n');
}

/**
 * Extracts text from a single Part.
 */
export function extractPartText(part: Part): string {
  if (isTextPart(part)) {
    return part.text;
  }

  if (isDataPart(part)) {
    // Attempt to format known data types if metadata exists, otherwise JSON stringify
    return `Data: ${JSON.stringify(part.data)}`;
  }

  if (isFilePart(part)) {
    const fileData = part.file;
    if (fileData.name) {
      return `File: ${fileData.name}`;
    }
    if ('uri' in fileData && fileData.uri) {
      return `File: ${fileData.uri}`;
    }
    return `File: [binary/unnamed]`;
  }

  return '';
}

/**
 * Extracts a human-readable text summary from a Task object.
 * Includes status, ID, and any artifact content.
 */
export function extractTaskText(task: Task): string {
  let output = `ID: ${task.id}\n`;
  output += `State: ${task.status.state}\n`;

  // Status Message
  const statusMessageText = extractMessageText(task.status.message);
  if (statusMessageText) {
    output += `Status Message: ${statusMessageText}\n`;
  }

  // Artifacts
  if (task.artifacts && task.artifacts.length > 0) {
    output += `Artifacts:\n`;
    for (const artifact of task.artifacts) {
      output += `  - Name: ${artifact.name}\n`;
      if (artifact.parts && artifact.parts.length > 0) {
        // Treat artifact parts as a message for extraction
        const artifactContent = artifact.parts
          .map((p) => extractPartText(p))
          .filter(Boolean)
          .join('\n');

        if (artifactContent) {
          // Indent content for readability
          const indentedContent = artifactContent.replace(/^/gm, '    ');
          output += `    Content:\n${indentedContent}\n`;
        }
      }
    }
  }

  return output;
}

// Type Guards

function isTextPart(part: Part): part is TextPart {
  return part.kind === 'text';
}

function isDataPart(part: Part): part is DataPart {
  return part.kind === 'data';
}

function isFilePart(part: Part): part is FilePart {
  return part.kind === 'file';
}

/**
 * Extracts contextId and taskId from a Message or Task response.
 * Follows the pattern from the A2A CLI sample to maintain conversational continuity.
 */
export function extractIdsFromResponse(result: Message | Task): {
  contextId?: string;
  taskId?: string;
} {
  let contextId: string | undefined;
  let taskId: string | undefined;

  if (result.kind === 'message') {
    taskId = result.taskId;
    contextId = result.contextId;
  } else if (result.kind === 'task') {
    taskId = result.id;
    contextId = result.contextId;

    // If the task is in a final state (and not input-required), we clear the taskId
    // so that the next interaction starts a fresh task (or keeps context without being bound to the old task).
    if (
      result.status &&
      result.status.state !== 'input-required' &&
      (result.status.state === 'completed' ||
        result.status.state === 'failed' ||
        result.status.state === 'canceled')
    ) {
      taskId = undefined;
    }
  }

  return { contextId, taskId };
}
