/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as acp from '@agentclientprotocol/sdk';
import { randomUUID } from 'node:crypto';

const MAX_RAW_JSON_BYTES = 32 * 1024;
export const ASSISTANT_MESSAGE_COMPLETED_EVENT = 'assistant_message_completed';
export const TRANSIENT_STATUS_EVENT = 'transient_status';

type PermissionContextInput = {
  displayName?: string;
  blockedPath?: string;
  decisionReason?: string;
  agentId?: string;
};

export function createAcpMessageId(): string {
  return randomUUID();
}

export function assistantMessageCompletedUpdate(
  messageId: string,
): acp.SessionUpdate {
  return {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: '' },
    messageId,
    _meta: {
      anyharness: {
        transcriptEvent: ASSISTANT_MESSAGE_COMPLETED_EVENT,
      },
    },
  };
}

export function transientStatusUpdate(
  text: string,
  messageId: string,
): acp.SessionUpdate {
  return {
    sessionUpdate: 'agent_thought_chunk',
    content: { type: 'text', text },
    messageId,
    _meta: {
      anyharness: {
        transcriptEvent: TRANSIENT_STATUS_EVENT,
      },
    },
  };
}

export function geminiPermissionContextMeta(
  input: PermissionContextInput,
): acp.RequestPermissionRequest['_meta'] | undefined {
  const permissionContext = compactRecord({
    displayName: nonEmptyString(input.displayName),
    blockedPath: nonEmptyString(input.blockedPath),
    decisionReason: nonEmptyString(input.decisionReason),
    agentId: nonEmptyString(input.agentId),
  });
  if (Object.keys(permissionContext).length === 0) {
    return undefined;
  }
  return {
    gemini: {
      permissionContext,
    },
  };
}

export function boundedRawJson(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return {
      _truncated: true,
      originalBytes: 0,
      preview: '[unserializable]',
    };
  }

  if (serialized === undefined) {
    return value;
  }

  const encoder = new TextEncoder();
  const bytes = encoder.encode(serialized);
  if (bytes.byteLength <= MAX_RAW_JSON_BYTES) {
    return value;
  }

  return {
    _truncated: true,
    originalBytes: bytes.byteLength,
    preview: new TextDecoder().decode(bytes.slice(0, MAX_RAW_JSON_BYTES)),
  };
}

function compactRecord(
  record: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}
