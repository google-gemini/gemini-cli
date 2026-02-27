/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Message,
  Part,
  TextPart,
  DataPart,
  FilePart,
  Artifact,
  TaskState,
  TaskStatusUpdateEvent,
} from '@a2a-js/sdk';
import type { SendMessageResult } from './a2a-client-manager.js';

/**
 * Reassembles incremental A2A streaming updates into a coherent result.
 * Shows sequential status/messages followed by all reassembled artifacts.
 */
export class A2AResultReassembler {
  private messageLog: string[] = [];
  private artifacts = new Map<string, Artifact>();
  private artifactChunks = new Map<string, string[]>();

  /**
   * Processes a new chunk from the A2A stream.
   */
  update(chunk: SendMessageResult) {
    if (!('kind' in chunk)) return;

    switch (chunk.kind) {
      case 'status-update':
        this.pushMessage(chunk.status?.message);
        break;

      case 'artifact-update':
        if (chunk.artifact) {
          const id = chunk.artifact.artifactId;
          const existing = this.artifacts.get(id);

          if (chunk.append && existing) {
            for (const part of chunk.artifact.parts) {
              existing.parts.push(structuredClone(part));
            }
          } else {
            this.artifacts.set(id, structuredClone(chunk.artifact));
          }

          const newText = extractPartsText(chunk.artifact.parts, '');
          let chunks = this.artifactChunks.get(id);
          if (!chunks) {
            chunks = [];
            this.artifactChunks.set(id, chunks);
          }
          if (chunk.append) {
            chunks.push(newText);
          } else {
            chunks.length = 0;
            chunks.push(newText);
          }
        }
        break;

      case 'task':
        this.pushMessage(chunk.status?.message);
        if (chunk.artifacts) {
          for (const art of chunk.artifacts) {
            this.artifacts.set(art.artifactId, structuredClone(art));
            this.artifactChunks.set(art.artifactId, [
              extractPartsText(art.parts, ''),
            ]);
          }
        }
        // History Fallback: Some agent implementations do not populate the
        // status.message in their final terminal response, instead archiving
        // the final answer in the task's history array. To ensure we don't
        // present an empty result, we fallback to the most recent agent message
        // in the history only when the task is terminal and no other content
        // (message log or artifacts) has been reassembled.
        if (
          isTerminalState(chunk.status?.state) &&
          this.messageLog.length === 0 &&
          this.artifacts.size === 0 &&
          chunk.history &&
          chunk.history.length > 0
        ) {
          const lastAgentMsg = [...chunk.history]
            .reverse()
            .find((m) => m.role?.toLowerCase().includes('agent'));
          if (lastAgentMsg) {
            this.pushMessage(lastAgentMsg);
          }
        }
        break;

      case 'message': {
        this.pushMessage(chunk);
        break;
      }

      default:
        break;
    }
  }

  private pushMessage(message: Message | undefined) {
    if (!message) return;
    const text = extractPartsText(message.parts, '\n');
    if (text && this.messageLog[this.messageLog.length - 1] !== text) {
      this.messageLog.push(text);
    }
  }

  /**
   * Returns a human-readable string representation of the current reassembled state.
   */
  toString(): string {
    const joinedMessages = this.messageLog.join('\n\n');

    const artifactsOutput = Array.from(this.artifacts.keys())
      .map((id) => {
        const chunks = this.artifactChunks.get(id);
        const artifact = this.artifacts.get(id);
        if (!chunks || !artifact) return '';
        const content = chunks.join('');
        const header = artifact.name
          ? `Artifact (${artifact.name}):`
          : 'Artifact:';
        return `${header}\n${content}`;
      })
      .filter(Boolean)
      .join('\n\n');

    if (joinedMessages && artifactsOutput) {
      return `${joinedMessages}\n\n${artifactsOutput}`;
    }
    return joinedMessages || artifactsOutput;
  }
}

/**
 * Extracts a human-readable text representation from a Message object.
 * Handles Text, Data (JSON), and File parts.
 */
export function extractMessageText(message: Message | undefined): string {
  if (!message || !message.parts || !Array.isArray(message.parts)) {
    return '';
  }

  return extractPartsText(message.parts, '\n');
}

/**
 * Extracts text from an array of parts, joining them with the specified separator.
 */
function extractPartsText(
  parts: Part[] | undefined,
  separator: string,
): string {
  if (!parts || parts.length === 0) {
    return '';
  }
  return parts
    .map((p) => extractPartText(p))
    .filter(Boolean)
    .join(separator);
}

/**
 * Extracts text from a single Part.
 */
function extractPartText(part: Part): string {
  if (isTextPart(part)) {
    return part.text;
  }

  if (isDataPart(part)) {
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

function isStatusUpdateEvent(
  result: SendMessageResult,
): result is TaskStatusUpdateEvent {
  return result.kind === 'status-update';
}

/**
 * Returns true if the given state is a terminal state for a task.
 */
export function isTerminalState(state: TaskState | undefined): boolean {
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
    const kind = result.kind;
    if (kind === 'message' || kind === 'artifact-update') {
      taskId = result.taskId;
      contextId = result.contextId;
    } else if (kind === 'task') {
      taskId = result.id;
      contextId = result.contextId;
      if (isTerminalState(result.status?.state)) {
        clearTaskId = true;
      }
    } else if (isStatusUpdateEvent(result)) {
      taskId = result.taskId;
      contextId = result.contextId;
      // Note: We ignore the 'final' flag here per A2A protocol best practices,
      // as a stream can close while a task is still in a 'working' state.
      if (isTerminalState(result.status?.state)) {
        clearTaskId = true;
      }
    }
  }

  return { contextId, taskId, clearTaskId };
}
