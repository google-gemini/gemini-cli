/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type EgressAction = 'COMMENT' | 'LABEL' | 'UNLABEL' | 'PATCH';

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

function isObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null;
}

/**
 * Type guard for PubSubMessageEnvelope to eliminate unsafe 'as' casts.
 */
export function isPubSubMessageEnvelope(
  obj: unknown,
): obj is PubSubMessageEnvelope {
  if (!isObject(obj)) {
    return false;
  }
  if ('message' in obj) {
    if (obj.message !== undefined && !isObject(obj.message)) {
      return false;
    }
  }
  return true;
}

/**
 * Type guard for EgressEvent.
 */
export function isEgressEvent(obj: unknown): obj is EgressEvent {
  if (!isObject(obj)) {
    return false;
  }
  if (
    typeof obj.action !== 'string' ||
    !['COMMENT', 'LABEL', 'UNLABEL', 'PATCH'].includes(obj.action)
  ) {
    return false;
  }
  if (!isObject(obj.payload)) {
    return false;
  }
  const payload = obj.payload;
  return (
    typeof payload.owner === 'string' &&
    typeof payload.repo === 'string' &&
    typeof payload.issueNumber === 'number'
  );
}
