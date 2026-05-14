/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentSend, ContentPart, ElicitationResponse } from './types.js';

export type UpdateCommand = {
  title?: string;
  model?: string;
  config?: Record<string, unknown>;
};

export type ActionCommand = {
  type: string;
  data: unknown;
};

export function isUserMessage(
  payload: AgentSend,
): payload is { message: { content: ContentPart[] } } {
  return !!payload.message;
}

export function isElicitationResponses(
  payload: AgentSend,
): payload is { elicitations: ElicitationResponse[] } {
  return !!payload.elicitations;
}

export function isUpdateCommand(
  payload: AgentSend,
): payload is { update: UpdateCommand } {
  return !!payload.update;
}

export function isAction(
  payload: AgentSend,
): payload is { action: ActionCommand } {
  return !!payload.action;
}
