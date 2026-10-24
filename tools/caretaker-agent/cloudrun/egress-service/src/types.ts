/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BaseEgressPayload {
  owner: string;
  repo: string;
  issueNumber: number;
}

export interface CommentEgressEvent {
  action: 'COMMENT';
  payload: BaseEgressPayload & {
    commentBody: string;
  };
}

export interface LabelEgressEvent {
  action: 'LABEL';
  payload: BaseEgressPayload & {
    labels: string[];
  };
}

export interface UnlabelEgressEvent {
  action: 'UNLABEL';
  payload: BaseEgressPayload & {
    labels: string[];
  };
}

export interface PatchEgressEvent {
  action: 'PATCH';
  payload: BaseEgressPayload & {
    patchContent?: string;
    branchName?: string;
  };
}

export type EgressEvent =
  | CommentEgressEvent
  | LabelEgressEvent
  | UnlabelEgressEvent
  | PatchEgressEvent;

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
  if (
    !isObject(obj) ||
    typeof obj.action !== 'string' ||
    !isObject(obj.payload)
  ) {
    return false;
  }

  // Validate base target repository properties required for all actions
  const payload = obj.payload;
  if (
    typeof payload.owner !== 'string' ||
    typeof payload.repo !== 'string' ||
    typeof payload.issueNumber !== 'number'
  ) {
    return false;
  }

  // Validate action-specific payload requirements for discriminated union
  switch (obj.action) {
    case 'COMMENT':
      return typeof payload.commentBody === 'string';
    case 'LABEL':
    case 'UNLABEL':
      return Array.isArray(payload.labels);
    case 'PATCH':
      // Note: PATCH action is not yet implemented in handleEgressEvent, so return true
      // to let base validation pass until patch payload fields are defined.
      return true;
    default:
      return false;
  }
}
