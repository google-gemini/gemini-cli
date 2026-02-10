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
  TaskStatusUpdateEvent,
} from '@a2a-js/sdk';
import type { SendMessageResult } from './a2a-client-manager.js';

/**
 * Extracts a human-readable text representation from a Message object.
 * Handles Text, Data (JSON), and File parts.
 */
export function extractMessageText(message: Message | undefined): string {
  if (!message) {
    return '';
  }

  return extractPartsText(message.parts);
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
 * Extracts a clean, human-readable text summary from a Task object.
 * Includes the status message and any artifact content with context headers.
 * Technical metadata like ID and State are omitted for better clarity and token efficiency.
 */
export function extractTaskText(task: Task): string {
  const parts: string[] = [];

  // Status Message
  const statusMessageText = extractMessageText(task.status?.message);
  if (statusMessageText) {
    parts.push(statusMessageText);
  }

  // Artifacts
  if (task.artifacts) {
    for (const artifact of task.artifacts) {
      const artifactContent = extractPartsText(artifact.parts);

      if (artifactContent) {
        const header = artifact.name
          ? `Artifact (${artifact.name}):`
          : 'Artifact:';
        parts.push(`${header}\n${artifactContent}`);
      }
    }
  }

  return parts.join('\n\n');
}

/**
 * Extracts text from an array of parts.
 */
function extractPartsText(parts: Part[] | undefined): string {
  if (!parts || parts.length === 0) {
    return '';
  }
  return parts
    .map((p) => extractPartText(p))
    .filter(Boolean)
    .join('\n');
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
 * Returns true if the given state is a terminal state for a task.
 */
export function isTerminalState(
  state:
    | 'submitted'
    | 'working'
    | 'input-required'
    | 'completed'
    | 'canceled'
    | 'failed'
    | 'rejected'
    | 'auth-required'
    | 'unknown'
    | undefined,
): boolean {
  return (
    state === 'completed' ||
    state === 'failed' ||
    state === 'canceled' ||
    state === 'rejected'
  );
}

/**
 * Extracts contextId and taskId from a Message, Task, or Update response.
 * Follows the pattern from the A2A CLI sample to maintain conversational continuity.
 */
export function extractIdsFromResponse(result: SendMessageResult): {
  contextId?: string;
  taskId?: string;
  clearTaskId?: boolean;
} {
  let contextId: string | undefined;
  let taskId: string | undefined;
  let clearTaskId = false;

  if ('kind' in result) {
    if (result.kind === 'message') {
      taskId = result.taskId;
      contextId = result.contextId;
    } else if (result.kind === 'task') {
      taskId = result.id;
      contextId = result.contextId;

      if (isTerminalState(result.status?.state)) {
        clearTaskId = true;
      }
    }
  } else if ('status' in result) {
    // TaskStatusUpdateEvent
    const update = result as TaskStatusUpdateEvent;
    contextId = update.contextId;

    if (isTerminalState(update.status?.state)) {
      clearTaskId = true;
    }
  }

  return { contextId, taskId, clearTaskId };
}

/**
 * Extracts a human-readable text representation from a Message, Task, or Update response.
 */
export function extractAnyText(result: SendMessageResult): string {
  if ('kind' in result) {
    if (result.kind === 'message') {
      return extractMessageText(result);
    }
    if (result.kind === 'task') {
      return extractTaskText(result);
    }
  }

  if ('status' in result && result.status?.message) {
    // TaskStatusUpdateEvent
    return extractMessageText(result.status.message);
  }

  // Fallback for Artifact updates or unknown types
  return '';
}

/**
 * Calculates the delta between the current text and the previous text.
 * Returns the delta if current starts with previous, otherwise returns current.
 */
export function getDelta(current: string, previous: string): string {
  if (current.startsWith(previous)) {
    return current.slice(previous.length);
  }
  return current;
}
