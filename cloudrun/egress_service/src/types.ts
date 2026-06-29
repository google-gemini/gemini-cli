/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type EgressAction = 'COMMENT' | 'LABEL' | 'PATCH';

export interface EgressEventPayload {
  owner: string;
  repo: string;
  issueNumber: number;
  commentBody?: string;
  labels?: string[];
  patchContent?: string;
  branchName?: string;
}

export interface EgressEvent {
  action: EgressAction;
  payload: EgressEventPayload;
}

export interface PubSubMessage {
  data?: string;
  messageId?: string;
  publishTime?: string;
  attributes?: Record<string, string>;
}

/**
 * Standard GCP Cloud Pub/Sub HTTP Push message wrapper envelope.
 *
 * @see https://cloud.google.com/pubsub/docs/push#delivery_format
 */
export interface PubSubMessageEnvelope {
  message?: PubSubMessage;
  subscription?: string;
}

/**
 * Type guard for PubSubMessageEnvelope to eliminate unsafe 'as' casts.
 */
export function isPubSubMessageEnvelope(
  obj: unknown,
): obj is PubSubMessageEnvelope {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const envelope = obj as Record<string, unknown>;
  if ('message' in envelope) {
    if (
      typeof envelope.message !== 'object' ||
      envelope.message === null
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Type guard for EgressEvent.
 */
export function isEgressEvent(obj: unknown): obj is EgressEvent {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const event = obj as Record<string, unknown>;
  if (
    typeof event.action !== 'string' ||
    !['COMMENT', 'LABEL', 'PATCH'].includes(event.action)
  ) {
    return false;
  }
  if (typeof event.payload !== 'object' || event.payload === null) {
    return false;
  }
  const payload = event.payload as Record<string, unknown>;
  return (
    typeof payload.owner === 'string' &&
    typeof payload.repo === 'string' &&
    typeof payload.issueNumber === 'number'
  );
}
