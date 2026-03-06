/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as grpc from '@grpc/grpc-js';
import type {
  Message,
  Part,
  TextPart,
  DataPart,
  FilePart,
  Artifact,
  TaskState,
  TaskStatusUpdateEvent,
  AgentCard,
  AgentInterface,
} from '@a2a-js/sdk';
import type { SendMessageResult } from './a2a-client-manager.js';

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

      case 'message': {
        this.pushMessage(chunk);
        break;
      }

      default:
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

/**
 * Normalizes an agent card by ensuring it has the required properties
 * and resolving any inconsistencies between protocol versions.
 */
export function normalizeAgentCard(card: unknown): AgentCard {
  if (!isObject(card)) {
    throw new Error('Agent card is missing.');
  }

  // Double-cast to bypass strict linter while bootstrapping the object.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const result = { ...card } as unknown as AgentCard;

  // Ensure mandatory fields exist with safe defaults.
  if (typeof result.name !== 'string') result.name = 'unknown';
  if (typeof result.description !== 'string') result.description = '';
  if (typeof result.url !== 'string') result.url = '';
  if (typeof result.version !== 'string') result.version = '';
  if (typeof result.protocolVersion !== 'string') result.protocolVersion = '';
  if (!isObject(result.capabilities)) result.capabilities = {};
  if (!Array.isArray(result.skills)) result.skills = [];
  if (!Array.isArray(result.defaultInputModes)) result.defaultInputModes = [];
  if (!Array.isArray(result.defaultOutputModes)) result.defaultOutputModes = [];

  // Normalize interfaces and synchronize both interface fields.
  const normalizedInterfaces = extractNormalizedInterfaces(card);
  result.additionalInterfaces = normalizedInterfaces;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  (result as unknown as Record<string, AgentInterface[]>)[
    'supportedInterfaces'
  ] = normalizedInterfaces;

  // Fallback preferredTransport: If not specified, default to GRPC if available.
  if (
    !result.preferredTransport &&
    normalizedInterfaces.some((i) => i.transport === 'GRPC')
  ) {
    result.preferredTransport = 'GRPC';
  }

  // Fallback: If top-level URL is missing, use the first interface's URL.
  if (result.url === '' && normalizedInterfaces.length > 0) {
    result.url = normalizedInterfaces[0].url;
  }

  return result;
}

/**
 * Returns gRPC channel credentials based on the URL scheme.
 */
export function getGrpcCredentials(url: string): grpc.ChannelCredentials {
  return url.startsWith('https://')
    ? grpc.credentials.createSsl()
    : grpc.credentials.createInsecure();
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

/**
 * Extracts and normalizes interfaces from the card, handling protocol version fallbacks.
 * Preserves all original fields to maintain SDK compatibility.
 */
function extractNormalizedInterfaces(
  card: Record<string, unknown>,
): AgentInterface[] {
  const rawInterfaces =
    getArray(card, 'additionalInterfaces') ||
    getArray(card, 'supportedInterfaces');

  if (!rawInterfaces) {
    return [];
  }

  const mapped: AgentInterface[] = [];
  for (const i of rawInterfaces) {
    if (isObject(i)) {
      // Create a copy to preserve all original fields.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const normalized = { ...i } as unknown as AgentInterface & {
        protocolBinding?: string;
      };

      // Ensure 'url' exists
      if (typeof normalized.url !== 'string') {
        normalized.url = '';
      }

      // Normalize 'transport' from 'protocolBinding'
      const transport = normalized.transport || normalized.protocolBinding;
      if (transport) {
        normalized.transport = transport;
      }

      // Robust URL: Ensure the URL has a scheme (except for gRPC).
      // Some agent implementations (like a2a-go samples) may provide raw IP:port strings.
      // gRPC targets MUST NOT have a scheme (e.g. 'http://'), or they will fail name resolution.
      if (
        normalized.url &&
        !normalized.url.includes('://') &&
        !normalized.url.startsWith('/') &&
        normalized.transport !== 'GRPC'
      ) {
        // Default to http:// for insecure REST/JSON-RPC if scheme is missing.
        normalized.url = `http://${normalized.url}`;
      }

      mapped.push(normalized);
    }
  }
  return mapped;
}

/**
 * Safely extracts an array property from an object.
 */
function getArray(
  obj: Record<string, unknown>,
  key: string,
): unknown[] | undefined {
  const val = obj[key];
  return Array.isArray(val) ? val : undefined;
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
 * Type guard to check if a value is a non-array object.
 */
function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}
