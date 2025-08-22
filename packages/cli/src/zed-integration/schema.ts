/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export const AGENT_METHODS = {
  authenticate: 'authenticate',
  initialize: 'initialize',
  session_cancel: 'session/cancel',
  session_load: 'session/load',
  session_new: 'session/new',
  session_prompt: 'session/prompt',
};

export const CLIENT_METHODS = {
  fs_read_text_file: 'fs/read_text_file',
  fs_write_text_file: 'fs/write_text_file',
  session_request_permission: 'session/request_permission',
  session_update: 'session/update',
};

export const PROTOCOL_VERSION = 1;

export type WriteTextFileRequest = z.infer<typeof writeTextFileRequestSchema>;

export type ReadTextFileRequest = z.infer<typeof readTextFileRequestSchema>;

export type PermissionOptionKind = z.infer<typeof permissionOptionKindSchema>;

export type Role = z.infer<typeof roleSchema>;

export type TextResourceContents = z.infer<typeof textResourceContentsSchema>;

export type BlobResourceContents = z.infer<typeof blobResourceContentsSchema>;

export type ToolKind = z.infer<typeof toolKindSchema>;

export type ToolCallStatus = z.infer<typeof toolCallStatusSchema>;

export type WriteTextFileResponse = z.infer<typeof writeTextFileResponseSchema>;

export type ReadTextFileResponse = z.infer<typeof readTextFileResponseSchema>;

export type RequestPermissionOutcome = z.infer<
  typeof requestPermissionOutcomeSchema
>;

export type CancelNotification = z.infer<typeof cancelNotificationSchema>;

export type AuthenticateRequest = z.infer<typeof authenticateRequestSchema>;

export type AuthenticateResponse = z.infer<typeof authenticateResponseSchema>;

export type NewSessionResponse = z.infer<typeof newSessionResponseSchema>;

export type LoadSessionResponse = z.infer<typeof loadSessionResponseSchema>;

export type StopReason = z.infer<typeof stopReasonSchema>;

export type PromptResponse = z.infer<typeof promptResponseSchema>;

export type ToolCallLocation = z.infer<typeof toolCallLocationSchema>;

export type PlanEntry = z.infer<typeof planEntrySchema>;

export type PermissionOption = z.infer<typeof permissionOptionSchema>;

export type Annotations = z.infer<typeof annotationsSchema>;

export type RequestPermissionResponse = z.infer<
  typeof requestPermissionResponseSchema
>;

export type FileSystemCapability = z.infer<typeof fileSystemCapabilitySchema>;

export type EnvVariable = z.infer<typeof envVariableSchema>;

export type McpServer = z.infer<typeof mcpServerSchema>;

export type AgentCapabilities = z.infer<typeof agentCapabilitiesSchema>;

export type AuthMethod = z.infer<typeof authMethodSchema>;

export type PromptCapabilities = z.infer<typeof promptCapabilitiesSchema>;

export type ClientResponse = z.infer<typeof clientResponseSchema>;

export type ClientNotification = z.infer<typeof clientNotificationSchema>;

export type EmbeddedResourceResource = z.infer<
  typeof embeddedResourceResourceSchema
>;

export type NewSessionRequest = z.infer<typeof newSessionRequestSchema>;

export type LoadSessionRequest = z.infer<typeof loadSessionRequestSchema>;

export type InitializeResponse = z.infer<typeof initializeResponseSchema>;

export type ContentBlock = z.infer<typeof contentBlockSchema>;

export type ToolCallContent = z.infer<typeof toolCallContentSchema>;

export type ToolCall = z.infer<typeof toolCallSchema>;

export type ClientCapabilities = z.infer<typeof clientCapabilitiesSchema>;

export type PromptRequest = z.infer<typeof promptRequestSchema>;

export type SessionUpdate = z.infer<typeof sessionUpdateSchema>;

export type AgentResponse = z.infer<typeof agentResponseSchema>;

export type RequestPermissionRequest = z.infer<
  typeof requestPermissionRequestSchema
>;

export type InitializeRequest = z.infer<typeof initializeRequestSchema>;

export type SessionNotification = z.infer<typeof sessionNotificationSchema>;

export type ClientRequest = z.infer<typeof clientRequestSchema>;

export type AgentRequest = z.infer<typeof agentRequestSchema>;

export type AgentNotification = z.infer<typeof agentNotificationSchema>;

export const writeTextFileRequestSchema = z.object({
  content: z.string(),
  path: z.string(),
  sessionId: z.string(),
});

export const readTextFileRequestSchema = z.object({
  limit: z.number().optional().nullable(),
  line: z.number().optional().nullable(),
  path: z.string(),
  sessionId: z.string(),
});

export const permissionOptionKindSchema = z.union([
  z.literal('allow_once'),
  z.literal('allow_always'),
  z.literal('reject_once'),
  z.literal('reject_always'),
]);

export const roleSchema = z.union([z.literal('assistant'), z.literal('user')]);

export const textResourceContentsSchema = z.object({
  mimeType: z.string().optional().nullable(),
  text: z.string(),
  uri: z.string(),
});

export const blobResourceContentsSchema = z.object({
  blob: z.string(),
  mimeType: z.string().optional().nullable(),
  uri: z.string(),
});

export const toolKindSchema = z.union([
  z.literal('read'),
  z.literal('edit'),
  z.literal('delete'),
  z.literal('move'),
  z.literal('search'),
  z.literal('execute'),
  z.literal('think'),
  z.literal('fetch'),
  z.literal('other'),
]);

export const toolCallStatusSchema = z.union([
  z.literal('pending'),
  z.literal('in_progress'),
  z.literal('completed'),
  z.literal('failed'),
]);

export const writeTextFileResponseSchema = z.null();

export const readTextFileResponseSchema = z.object({
  content: z.string(),
});

export const requestPermissionOutcomeSchema = z.union([
  z.object({
    outcome: z.literal('cancelled'),
  }),
  z.object({
    optionId: z.string(),
    outcome: z.literal('selected'),
  }),
]);

export const cancelNotificationSchema = z.object({
  sessionId: z.string(),
});

export const authenticateRequestSchema = z.object({
  methodId: z.string(),
});

export const authenticateResponseSchema = z.null();

export const newSessionResponseSchema = z.object({
  sessionId: z.string(),
});

export const loadSessionResponseSchema = z.null();

export const stopReasonSchema = z.union([
  z.literal('end_turn'),
  z.literal('max_tokens'),
  z.literal('refusal'),
  z.literal('cancelled'),
]);

export const promptResponseSchema = z.object({
  stopReason: stopReasonSchema,
});

export const toolCallLocationSchema = z.object({
  line: z.number().optional().nullable(),
  path: z.string(),
});

export const planEntrySchema = z.object({
  content: z.string(),
  priority: z.union([z.literal('high'), z.literal('medium'), z.literal('low')]),
  status: z.union([
    z.literal('pending'),
    z.literal('in_progress'),
    z.literal('completed'),
  ]),
});

export const permissionOptionSchema = z.object({
  kind: permissionOptionKindSchema,
  name: z.string(),
  optionId: z.string(),
});

export const annotationsSchema = z.object({
  audience: z.array(roleSchema).optional().nullable(),
  lastModified: z.string().optional().nullable(),
  priority: z.number().optional().nullable(),
});

export const requestPermissionResponseSchema = z.object({
  outcome: requestPermissionOutcomeSchema,
});

export const fileSystemCapabilitySchema = z.object({
  readTextFile: z.boolean(),
  writeTextFile: z.boolean(),
});

export const envVariableSchema = z.object({
  name: z.string(),
  value: z.string(),
});

export const mcpServerSchema = z.object({
  args: z.array(z.string()),
  command: z.string(),
  env: z.array(envVariableSchema),
  name: z.string(),
});

export const promptCapabilitiesSchema = z.object({
  audio: z.boolean().optional(),
  embeddedContext: z.boolean().optional(),
  image: z.boolean().optional(),
});

export const agentCapabilitiesSchema = z.object({
  loadSession: z.boolean().optional(),
  promptCapabilities: promptCapabilitiesSchema.optional(),
});

export const authMethodSchema = z.object({
  description: z.string().nullable(),
  id: z.string(),
  name: z.string(),
});

export const clientResponseSchema = z.union([
  writeTextFileResponseSchema,
  readTextFileResponseSchema,
  requestPermissionResponseSchema,
]);

export const clientNotificationSchema = cancelNotificationSchema;

export const embeddedResourceResourceSchema = z.union([
  textResourceContentsSchema,
  blobResourceContentsSchema,
]);

export const newSessionRequestSchema = z.object({
  cwd: z.string(),
  mcpServers: z.array(mcpServerSchema),
});

export const loadSessionRequestSchema = z.object({
  cwd: z.string(),
  mcpServers: z.array(mcpServerSchema),
  sessionId: z.string(),
});

export const initializeResponseSchema = z.object({
  agentCapabilities: agentCapabilitiesSchema,
  authMethods: z.array(authMethodSchema),
  protocolVersion: z.number(),
});

export const contentBlockSchema = z.union([
  z.object({
    annotations: annotationsSchema.optional().nullable(),
    text: z.string(),
    type: z.literal('text'),
  }),
  z.object({
    annotations: annotationsSchema.optional().nullable(),
    data: z.string(),
    mimeType: z.string(),
    type: z.literal('image'),
  }),
  z.object({
    annotations: annotationsSchema.optional().nullable(),
    data: z.string(),
    mimeType: z.string(),
    type: z.literal('audio'),
  }),
  z.object({
    annotations: annotationsSchema.optional().nullable(),
    description: z.string().optional().nullable(),
    mimeType: z.string().optional().nullable(),
    name: z.string(),
    size: z.number().optional().nullable(),
    title: z.string().optional().nullable(),
    type: z.literal('resource_link'),
    uri: z.string(),
  }),
  z.object({
    annotations: annotationsSchema.optional().nullable(),
    resource: embeddedResourceResourceSchema,
    type: z.literal('resource'),
  }),
]);

export const toolCallContentSchema = z.union([
  z.object({
    content: contentBlockSchema,
    type: z.literal('content'),
  }),
  z.object({
    newText: z.string(),
    oldText: z.string().nullable(),
    path: z.string(),
    type: z.literal('diff'),
  }),
]);

export const toolCallSchema = z.object({
  content: z.array(toolCallContentSchema).optional(),
  kind: toolKindSchema,
  locations: z.array(toolCallLocationSchema).optional(),
  rawInput: z.unknown().optional(),
  status: toolCallStatusSchema,
  title: z.string(),
  toolCallId: z.string(),
});

export const clientCapabilitiesSchema = z.object({
  fs: fileSystemCapabilitySchema,
});

export const promptRequestSchema = z.object({
  prompt: z.array(contentBlockSchema),
  sessionId: z.string(),
});

export const sessionUpdateSchema = z.union([
  z.object({
    content: contentBlockSchema,
    sessionUpdate: z.literal('user_message_chunk'),
  }),
  z.object({
    content: contentBlockSchema,
    sessionUpdate: z.literal('agent_message_chunk'),
  }),
  z.object({
    content: contentBlockSchema,
    sessionUpdate: z.literal('agent_thought_chunk'),
  }),
  z.object({
    content: z.array(toolCallContentSchema).optional(),
    kind: toolKindSchema,
    locations: z.array(toolCallLocationSchema).optional(),
    rawInput: z.unknown().optional(),
    sessionUpdate: z.literal('tool_call'),
    status: toolCallStatusSchema,
    title: z.string(),
    toolCallId: z.string(),
  }),
  z.object({
    content: z.array(toolCallContentSchema).optional().nullable(),
    kind: toolKindSchema.optional().nullable(),
    locations: z.array(toolCallLocationSchema).optional().nullable(),
    rawInput: z.unknown().optional(),
    sessionUpdate: z.literal('tool_call_update'),
    status: toolCallStatusSchema.optional().nullable(),
    title: z.string().optional().nullable(),
    toolCallId: z.string(),
  }),
  z.object({
    entries: z.array(planEntrySchema),
    sessionUpdate: z.literal('plan'),
  }),
]);

export const agentResponseSchema = z.union([
  initializeResponseSchema,
  authenticateResponseSchema,
  newSessionResponseSchema,
  loadSessionResponseSchema,
  promptResponseSchema,
]);

export const requestPermissionRequestSchema = z.object({
  options: z.array(permissionOptionSchema),
  sessionId: z.string(),
  toolCall: toolCallSchema,
});

export const initializeRequestSchema = z.object({
  clientCapabilities: clientCapabilitiesSchema,
  protocolVersion: z.number(),
});

export const sessionNotificationSchema = z.object({
  sessionId: z.string(),
  update: sessionUpdateSchema,
});

export const clientRequestSchema = z.union([
  writeTextFileRequestSchema,
  readTextFileRequestSchema,
  requestPermissionRequestSchema,
]);

export const agentRequestSchema = z.union([
  initializeRequestSchema,
  authenticateRequestSchema,
  newSessionRequestSchema,
  loadSessionRequestSchema,
  promptRequestSchema,
]);

export const agentNotificationSchema = sessionNotificationSchema;
