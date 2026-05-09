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
  AgentCard,
  AgentInterface,
} from '@a2a-js/sdk';
import type { SendMessageResult } from './a2a-client-manager.js';
import type { SubagentActivityItem } from './types.js';

export const AUTH_REQUIRED_MSG = `[Authorization Required] The agent has indicated it requires authorization to proceed. Please follow the agent's instructions.`;

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
        this.appendStateInstructions(chunk.status?.state);
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
        this.appendStateInstructions(chunk.status?.state);
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

      case 'message':
        this.pushMessage(chunk);
        break;
      default:
        // Handle unknown kinds gracefully
        break;
    }
  }

  private appendStateInstructions(state: TaskState | undefined) {
    if (state !== 'auth-required') {
      return;
    }

    // Prevent duplicate instructions if multiple chunks report auth-required
    if (!this.messageLog.includes(AUTH_REQUIRED_MSG)) {
      this.messageLog.push(AUTH_REQUIRED_MSG);
    }
  }

  private pushMessage(message: Message | undefined) {
    if (!message) return;
    if (message.role === 'user') return; // Skip user messages reflected by server
    const text = extractPartsText(message.parts, '');
    if (text && this.messageLog.at(-1) !== text) {
      this.messageLog.push(text);
    }
  }

  /**
   * Returns an array of activity items representing the current reassembled state.
   */
  toActivityItems(): SubagentActivityItem[] {
    const isAuthRequired = this.messageLog.includes(AUTH_REQUIRED_MSG);
    const items: SubagentActivityItem[] = [];

    if (isAuthRequired) {
      items.push({
        id: 'auth-required',
        type: 'thought',
        content: AUTH_REQUIRED_MSG,
        status: 'running',
      });
    }

    this.messageLog.forEach((msg, index) => {
      items.push({
        id: `msg-${index}`,
        type: 'thought',
        content: msg.trim(),
        status: 'completed',
      });
    });

    if (items.length === 0 && !isAuthRequired) {
      items.push({
        id: 'pending',
        type: 'thought',
        content: 'Working...',
        status: 'running',
      });
    }

    return items;
  }

  /**
   * Returns a human-readable string representation of the current reassembled state.
   */
  toString(): string {
    const joinedMessages = this.messageLog.join('');

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

/**
 * Normalizes proto field name aliases that the SDK doesn't handle yet.
 * The A2A proto spec uses `supported_interfaces` and `protocol_binding`,
 * while the SDK expects `additionalInterfaces` and `transport`.
 * TODO: Remove once @a2a-js/sdk handles these aliases natively.
 */
export function normalizeAgentCard(card: unknown): AgentCard {
  if (!isObject(card)) {
    throw new Error('Agent card is missing.');
  }

  // Shallow-copy to avoid mutating the SDK's cached object.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const result = { ...card } as unknown as AgentCard;

  // Map supportedInterfaces → additionalInterfaces if needed
  if (!result.additionalInterfaces) {
    const raw = card;
    if (Array.isArray(raw['supportedInterfaces'])) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      result.additionalInterfaces = raw[
        'supportedInterfaces'
      ] as AgentInterface[];
    }
  }

  // Map protocolBinding → transport on each interface
  for (const intf of result.additionalInterfaces ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const raw = intf as unknown as Record<string, unknown>;
    const binding = raw['protocolBinding'];

    if (!intf.transport && typeof binding === 'string') {
      intf.transport = binding;
    }
  }

  return result;
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

  if (!('kind' in result)) return { contextId, taskId, clearTaskId };

  switch (result.kind) {
    case 'message':
    case 'artifact-update':
      taskId = result.taskId;
      contextId = result.contextId;
      break;

    case 'task':
      taskId = result.id;
      contextId = result.contextId;
      if (isTerminalState(result.status?.state)) {
        clearTaskId = true;
      }
      break;

    case 'status-update':
      taskId = result.taskId;
      contextId = result.contextId;
      if (isTerminalState(result.status?.state)) {
        clearTaskId = true;
      }
      break;
    default:
      // Handle other kind values if any
      break;
  }

  return { contextId, taskId, clearTaskId };
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
export function isTerminalState(state: TaskState | undefined): boolean {
  return (
    state === 'completed' ||
    state === 'failed' ||
    state === 'canceled' ||
    state === 'rejected'
  );
}

/**
 * Type guard to check if a value is a non-array object.
 */
function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}
