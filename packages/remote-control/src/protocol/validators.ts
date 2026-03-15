/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { RemoteControlMessageType } from './types.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const RemoteControlMessageSchema = z.object({
  type: z.nativeEnum(RemoteControlMessageType),
  sessionId: z.string().uuid(),
  timestamp: z.string().datetime(),
  messageId: z.string().uuid(),
  payload: z.unknown(),
  metadata: z.record(z.unknown()).optional(),
});

export const UserMessagePayloadSchema = z.object({
  content: z.string().min(1).max(100_000),
  attachments: z
    .array(
      z.object({
        type: z.enum(['file', 'image']),
        name: z.string().max(255),
        content: z.string(),
        mimeType: z.string().max(128),
      }),
    )
    .optional(),
});

export const ToolApprovalResponseSchema = z.object({
  toolCallId: z.string().uuid(),
  approved: z.boolean(),
  reason: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

export type ParsedRemoteControlMessage = z.infer<
  typeof RemoteControlMessageSchema
>;

export type ParsedUserMessagePayload = z.infer<typeof UserMessagePayloadSchema>;

/**
 * Parses and returns a validated RemoteControlMessage.
 * Throws a ZodError on invalid input.
 */
export function parseMessage(data: unknown): ParsedRemoteControlMessage {
  return RemoteControlMessageSchema.parse(data);
}

/**
 * Parses and returns a validated UserMessagePayload.
 * Throws a ZodError on invalid input.
 */
export function parseUserMessagePayload(
  data: unknown,
): ParsedUserMessagePayload {
  return UserMessagePayloadSchema.parse(data);
}

/**
 * Returns true if `data` looks like a RemoteControlMessage without throwing.
 */
export function isValidMessage(
  data: unknown,
): data is ParsedRemoteControlMessage {
  return RemoteControlMessageSchema.safeParse(data).success;
}
