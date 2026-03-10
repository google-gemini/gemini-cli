/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as grpc from '@grpc/grpc-js';
import { lookup } from 'node:dns/promises';
import { z } from 'zod';
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
import { isAddressPrivate } from '../utils/fetch.js';
import type { SendMessageResult } from './a2a-client-manager.js';

export const AUTH_REQUIRED_MSG = `[Authorization Required] The agent has indicated it requires authorization to proceed. Please follow the agent's instructions.`;

const AgentInterfaceSchema = z
  .object({
    url: z.string().default(''),
    transport: z.string().optional(),
    protocolBinding: z.string().optional(),
  })
  .passthrough();

const AgentCardSchema = z
  .object({
    name: z.string().default('unknown'),
    description: z.string().default(''),
    url: z.string().default(''),
    version: z.string().default(''),
    protocolVersion: z.string().default(''),
    capabilities: z.record(z.unknown()).default({}),
    skills: z.array(z.union([z.string(), z.record(z.unknown())])).default([]),
    defaultInputModes: z.array(z.string()).default([]),
    defaultOutputModes: z.array(z.string()).default([]),

    additionalInterfaces: z.array(AgentInterfaceSchema).optional(),
    supportedInterfaces: z.array(AgentInterfaceSchema).optional(),
    preferredTransport: z.string().optional(),
  })
  .passthrough();

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

  // Use Zod to validate and parse the card, ensuring safe defaults and narrowing types.
  const parsed = AgentCardSchema.parse(card);
  // Narrowing to AgentCard interface after runtime validation.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const result = parsed as unknown as AgentCard;

  // Normalize interfaces and synchronize both interface fields.
  const normalizedInterfaces = extractNormalizedInterfaces(parsed);
  result.additionalInterfaces = normalizedInterfaces;

  // Sync supportedInterfaces for backward compatibility.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const legacyResult = result as unknown as Record<string, AgentInterface[]>;
  legacyResult['supportedInterfaces'] = normalizedInterfaces;

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
 * Returns gRPC channel options to ensure SSL/authority matches the original hostname
 * when connecting via a pinned IP address.
 */
export function getGrpcChannelOptions(
  hostname: string,
): Record<string, unknown> {
  return {
    'grpc.default_authority': hostname,
    'grpc.ssl_target_name_override': hostname,
  };
}

/**
 * Resolves a hostname to its IP address and validates it against SSRF.
 * Returns the pinned IP-based URL and the original hostname.
 */
export async function pinUrlToIp(
  url: string,
  agentName: string,
): Promise<{ pinnedUrl: string; hostname: string }> {
  if (!url) return { pinnedUrl: url, hostname: '' };

  // gRPC URLs in A2A can be 'host:port' or 'dns:///host:port' or have schemes.
  // We normalize to host:port for resolution.
  const hasScheme = url.includes('://');
  const normalizedUrl = hasScheme ? url : `http://${url}`;

  try {
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname;

    const sanitizedHost =
      hostname.startsWith('[') && hostname.endsWith(']')
        ? hostname.slice(1, -1)
        : hostname;

    // Resolve DNS to check the actual target IP and pin it
    const addresses = await lookup(hostname, { all: true });
    const publicAddresses = addresses.filter(
      (addr) =>
        !isAddressPrivate(addr.address) ||
        sanitizedHost === 'localhost' ||
        sanitizedHost === '127.0.0.1' ||
        sanitizedHost === '::1',
    );

    if (publicAddresses.length === 0) {
      if (addresses.length > 0) {
        throw new Error(
          `Refusing to load agent '${agentName}': transport URL '${url}' resolves to private IP range.`,
        );
      }
      throw new Error(
        `Failed to resolve any public IP addresses for host: ${hostname}`,
      );
    }

    const pinnedIp = publicAddresses[0].address;
    const pinnedHostname = pinnedIp.includes(':') ? `[${pinnedIp}]` : pinnedIp;

    // Reconstruct URL with IP
    parsed.hostname = pinnedHostname;
    let pinnedUrl = parsed.toString();

    // If original didn't have scheme, remove it (standard for gRPC targets)
    if (!hasScheme) {
      pinnedUrl = pinnedUrl.replace(/^http:\/\//, '');
      // URL.toString() might append a trailing slash
      if (pinnedUrl.endsWith('/') && !url.endsWith('/')) {
        pinnedUrl = pinnedUrl.slice(0, -1);
      }
    }

    return { pinnedUrl, hostname };
  } catch (e) {
    if (e instanceof Error && e.message.includes('Refusing')) throw e;
    throw new Error(`Failed to resolve host for agent '${agentName}': ${url}`, {
      cause: e,
    });
  }
}

/**
 * Splts an agent card URL into a baseUrl and a standard path if it already
 * contains '.well-known/agent-card.json'.
 */
export function splitAgentCardUrl(url: string): {
  baseUrl: string;
  path?: string;
} {
  const standardPath = '.well-known/agent-card.json';
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname.endsWith(standardPath)) {
      // Reconstruct baseUrl from parsed components to avoid issues with hashes or query params.
      parsedUrl.pathname = parsedUrl.pathname.substring(
        0,
        parsedUrl.pathname.lastIndexOf(standardPath),
      );
      parsedUrl.search = '';
      parsedUrl.hash = '';
      // We return undefined for path if it's the standard one,
      // because the SDK's DefaultAgentCardResolver appends it automatically.
      return { baseUrl: parsedUrl.toString(), path: undefined };
    }
  } catch (_e) {
    // Ignore URL parsing errors here, let the resolver handle them.
  }
  return { baseUrl: url };
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
      // Use schema to validate interface object.
      const parsed = AgentInterfaceSchema.parse(i);
      // Narrowing to AgentInterface after runtime validation.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const normalized = parsed as unknown as AgentInterface & {
        protocolBinding?: string;
      };

      // Normalize 'transport' from 'protocolBinding' if missing.
      if (!normalized.transport && normalized.protocolBinding) {
        normalized.transport = normalized.protocolBinding;
      }

      // Robust URL: Ensure the URL has a scheme (except for gRPC).
      if (
        normalized.url &&
        !normalized.url.includes('://') &&
        !normalized.url.startsWith('/') &&
        normalized.transport !== 'GRPC'
      ) {
        // Default to http:// for insecure REST/JSON-RPC if scheme is missing.
        normalized.url = `http://${normalized.url}`;
      }

      mapped.push(normalized as AgentInterface);
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
