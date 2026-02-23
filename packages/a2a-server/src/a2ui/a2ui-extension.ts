/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A2UI (Agent-to-UI) Extension for A2A protocol.
 * Implements the A2UI v0.10 specification for generating declarative UI
 * messages that clients can render natively.
 *
 * @see https://a2ui.org/specification/v0_10/docs/a2ui_protocol.md
 * @see https://a2ui.org/specification/v0_10/docs/a2ui_extension_specification.md
 */

import type { Part } from '@a2a-js/sdk';

// Extension constants
export const A2UI_EXTENSION_URI = 'https://a2ui.org/a2a-extension/a2ui/v0.10';
export const A2UI_MIME_TYPE = 'application/json+a2ui';
export const A2UI_VERSION = 'v0.10';
export const STANDARD_CATALOG_ID =
  'https://a2ui.org/specification/v0_10/standard_catalog.json';

// Metadata keys
export const MIME_TYPE_KEY = 'mimeType';
export const A2UI_CLIENT_CAPABILITIES_KEY = 'a2uiClientCapabilities';
export const A2UI_CLIENT_DATA_MODEL_KEY = 'a2uiClientDataModel';

/**
 * A2UI message types (server-to-client).
 */
export interface CreateSurfaceMessage {
  version: typeof A2UI_VERSION;
  createSurface: {
    surfaceId: string;
    catalogId: string;
    theme?: Record<string, unknown>;
    sendDataModel?: boolean;
  };
}

export interface UpdateComponentsMessage {
  version: typeof A2UI_VERSION;
  updateComponents: {
    surfaceId: string;
    components: A2UIComponent[];
  };
}

export interface UpdateDataModelMessage {
  version: typeof A2UI_VERSION;
  updateDataModel: {
    surfaceId: string;
    path?: string;
    value?: unknown;
  };
}

export interface DeleteSurfaceMessage {
  version: typeof A2UI_VERSION;
  deleteSurface: {
    surfaceId: string;
  };
}

export type A2UIServerMessage =
  | CreateSurfaceMessage
  | UpdateComponentsMessage
  | UpdateDataModelMessage
  | DeleteSurfaceMessage;

/**
 * A2UI component definition.
 */
export interface A2UIComponent {
  id: string;
  component: string;
  [key: string]: unknown;
}

/**
 * A2UI client-to-server action message.
 */
export interface A2UIActionMessage {
  version: typeof A2UI_VERSION;
  action: {
    name: string;
    surfaceId: string;
    sourceComponentId: string;
    timestamp: string;
    context: Record<string, unknown>;
  };
}

/**
 * A2UI client capabilities sent in metadata.
 */
export interface A2UIClientCapabilities {
  supportedCatalogIds: string[];
  inlineCatalogs?: unknown[];
}

/**
 * Creates an A2A DataPart containing A2UI messages.
 * Per the spec, the data field contains an ARRAY of A2UI messages.
 */
export function createA2UIPart(messages: A2UIServerMessage[]): Part {
  return {
    kind: 'data',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    data: messages as unknown as Record<string, unknown>,
    metadata: {
      [MIME_TYPE_KEY]: A2UI_MIME_TYPE,
    },
  } as Part;
}

/**
 * Creates a single A2A DataPart from one A2UI message.
 */
export function createA2UISinglePart(message: A2UIServerMessage): Part {
  return createA2UIPart([message]);
}

/**
 * Checks if an A2A Part contains A2UI data.
 */
export function isA2UIPart(part: Part): boolean {
  return (
    part.kind === 'data' &&
    part.metadata != null &&
    part.metadata[MIME_TYPE_KEY] === A2UI_MIME_TYPE
  );
}

/**
 * Extracts A2UI action messages from an A2A Part.
 */
export function extractA2UIActions(part: Part): A2UIActionMessage[] {
  if (!isA2UIPart(part)) return [];
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const data = (part as unknown as { data?: unknown[] }).data;
  if (!Array.isArray(data)) return [];
  return data.filter(
    (msg): msg is A2UIActionMessage =>
      typeof msg === 'object' &&
      msg !== null &&
      'action' in msg &&
      'version' in msg,
  );
}

/**
 * Creates the A2UI AgentExtension configuration for the AgentCard.
 */
export function getA2UIAgentExtension(
  supportedCatalogIds: string[] = [STANDARD_CATALOG_ID],
  acceptsInlineCatalogs = false,
): {
  uri: string;
  description: string;
  required: boolean;
  params: Record<string, unknown>;
} {
  const params: Record<string, unknown> = {};
  if (supportedCatalogIds.length > 0) {
    params['supportedCatalogIds'] = supportedCatalogIds;
  }
  if (acceptsInlineCatalogs) {
    params['acceptsInlineCatalogs'] = true;
  }

  return {
    uri: A2UI_EXTENSION_URI,
    description: 'Provides agent driven UI using the A2UI JSON format.',
    required: false,
    params,
  };
}

/**
 * Checks if the A2UI extension was requested via extension headers or message.
 */
export function isA2UIRequested(
  requestedExtensions?: string[],
  messageExtensions?: string[],
): boolean {
  return (
    (requestedExtensions?.includes(A2UI_EXTENSION_URI) ?? false) ||
    (messageExtensions?.includes(A2UI_EXTENSION_URI) ?? false)
  );
}
