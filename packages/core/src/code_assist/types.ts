/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export interface ClientMetadata {
  ideType?: ClientMetadataIdeType;
  ideVersion?: string;
  pluginVersion?: string;
  platform?: ClientMetadataPlatform;
  updateChannel?: string;
  duetProject?: string;
  pluginType?: ClientMetadataPluginType;
  ideName?: string;
}

export type ClientMetadataIdeType =
  | 'IDE_UNSPECIFIED'
  | 'VSCODE'
  | 'INTELLIJ'
  | 'VSCODE_CLOUD_WORKSTATION'
  | 'INTELLIJ_CLOUD_WORKSTATION'
  | 'CLOUD_SHELL'
  | 'GEMINI_CLI';
export type ClientMetadataPlatform =
  | 'PLATFORM_UNSPECIFIED'
  | 'DARWIN_AMD64'
  | 'DARWIN_ARM64'
  | 'LINUX_AMD64'
  | 'LINUX_ARM64'
  | 'WINDOWS_AMD64';
export type ClientMetadataPluginType =
  | 'PLUGIN_UNSPECIFIED'
  | 'CLOUD_CODE'
  | 'GEMINI'
  | 'AIPLUGIN_INTELLIJ'
  | 'AIPLUGIN_STUDIO';

export interface LoadCodeAssistRequest {
  cloudaicompanionProject?: string;
  metadata: ClientMetadata;
}

/**
 * UserTierId represents IDs returned from the Cloud Code Private API representing a user's tier
 *
 * This is a subset of all available tiers. Since the source list is frequently updated,
 * only add a tierId here if specific client-side handling is required.
 */
export const UserTierId = {
  FREE: 'free-tier',
  LEGACY: 'legacy-tier',
  STANDARD: 'standard-tier',
} as const;

export type UserTierId = (typeof UserTierId)[keyof typeof UserTierId] | string;

/**
 * PrivacyNotice reflects the structure received from the CodeAssist in regards to a tier
 * privacy notice.
 */
export const PrivacyNoticeSchema = z.object({
  showNotice: z.boolean(),
  noticeText: z.string().optional(),
});
export type PrivacyNotice = z.infer<typeof PrivacyNoticeSchema>;

/**
 * GeminiUserTier reflects the structure received from the CodeAssist when calling LoadCodeAssist.
 */
export const GeminiUserTierSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  userDefinedCloudaicompanionProject: z.boolean().nullable().optional(),
  isDefault: z.boolean().optional(),
  privacyNotice: PrivacyNoticeSchema.optional(),
  hasAcceptedTos: z.boolean().optional(),
  hasOnboardedPreviously: z.boolean().optional(),
});
export type GeminiUserTier = z.infer<typeof GeminiUserTierSchema>;

/**
 * List of predefined reason codes when a tier is blocked from a specific tier.
 * https://source.corp.google.com/piper///depot/google3/google/internal/cloud/code/v1internal/cloudcode.proto;l=378
 */
export enum IneligibleTierReasonCode {
  // go/keep-sorted start
  DASHER_USER = 'DASHER_USER',
  INELIGIBLE_ACCOUNT = 'INELIGIBLE_ACCOUNT',
  NON_USER_ACCOUNT = 'NON_USER_ACCOUNT',
  RESTRICTED_AGE = 'RESTRICTED_AGE',
  RESTRICTED_NETWORK = 'RESTRICTED_NETWORK',
  UNKNOWN = 'UNKNOWN',
  UNKNOWN_LOCATION = 'UNKNOWN_LOCATION',
  UNSUPPORTED_LOCATION = 'UNSUPPORTED_LOCATION',
  VALIDATION_REQUIRED = 'VALIDATION_REQUIRED',
  // go/keep-sorted end
}

/**
 * Includes information specifying the reasons for a user's ineligibility for a specific tier.
 * @param reasonCode mnemonic code representing the reason for in-eligibility.
 * @param reasonMessage message to display to the user.
 * @param tierId id of the tier.
 * @param tierName name of the tier.
 */
export const IneligibleTierSchema = z.object({
  reasonCode: z.nativeEnum(IneligibleTierReasonCode),
  reasonMessage: z.string(),
  tierId: z.string(),
  tierName: z.string(),
  validationErrorMessage: z.string().optional(),
  validationUrl: z.string().optional(),
  validationUrlLinkText: z.string().optional(),
  validationLearnMoreUrl: z.string().optional(),
  validationLearnMoreLinkText: z.string().optional(),
});
export type IneligibleTier = z.infer<typeof IneligibleTierSchema>;

/**
 * Represents LoadCodeAssistResponse proto json field
 */
export const LoadCodeAssistResponseSchema = z.object({
  currentTier: GeminiUserTierSchema.nullable().optional(),
  allowedTiers: z.array(GeminiUserTierSchema).nullable().optional(),
  ineligibleTiers: z.array(IneligibleTierSchema).nullable().optional(),
  cloudaicompanionProject: z.string().nullable().optional(),
  paidTier: GeminiUserTierSchema.nullable().optional(),
});
export type LoadCodeAssistResponse = z.infer<
  typeof LoadCodeAssistResponseSchema
>;

/**
 * Proto signature of OnboardUserRequest as payload to OnboardUser call
 */
export interface OnboardUserRequest {
  tierId: string | undefined;
  cloudaicompanionProject: string | undefined;
  metadata: ClientMetadata | undefined;
}

/**
 * Represents OnboardUserResponse proto
 * http://google3/google/internal/cloud/code/v1internal/cloudcode.proto;l=215
 */
export const OnboardUserResponseSchema = z.object({
  // tslint:disable-next-line:enforce-name-casing This is the name of the field in the proto.
  cloudaicompanionProject: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .optional(),
});
export type OnboardUserResponse = z.infer<typeof OnboardUserResponseSchema>;

/**
 * Represents LongRunningOperation proto
 */
export const LongRunningOperationResponseSchema = z.object({
  name: z.string(),
  done: z.boolean().optional(),
  response: OnboardUserResponseSchema.optional(),
});
export type LongRunningOperationResponse = z.infer<
  typeof LongRunningOperationResponseSchema
>;

/**
 * Status code of user license status
 * it does not strictly correspond to the proto
 * Error value is an additional value assigned to error responses from OnboardUser
 */
export enum OnboardUserStatusCode {
  Default = 'DEFAULT',
  Notice = 'NOTICE',
  Warning = 'WARNING',
  Error = 'ERROR',
}

/**
 * Status of user onboarded to gemini
 */
export interface OnboardUserStatus {
  statusCode: OnboardUserStatusCode;
  displayMessage: string;
  helpLink: HelpLinkUrl | undefined;
}

export interface HelpLinkUrl {
  description: string;
  url: string;
}

export interface SetCodeAssistGlobalUserSettingRequest {
  cloudaicompanionProject?: string;
  freeTierDataCollectionOptin?: boolean;
}

export const CodeAssistGlobalUserSettingResponseSchema = z.object({
  cloudaicompanionProject: z.string().optional(),
  freeTierDataCollectionOptin: z.boolean(),
});
export type CodeAssistGlobalUserSettingResponse = z.infer<
  typeof CodeAssistGlobalUserSettingResponseSchema
>;

/**
 * Relevant fields that can be returned from a Google RPC response
 */
export interface GoogleRpcResponse {
  error?: {
    details?: GoogleRpcErrorInfo[];
  };
}

/**
 * Relevant fields that can be returned in the details of an error returned from GoogleRPCs
 */
interface GoogleRpcErrorInfo {
  reason?: string;
}

export interface RetrieveUserQuotaRequest {
  project: string;
  userAgent?: string;
}

export const BucketInfoSchema = z.object({
  remainingAmount: z.string().optional(),
  remainingFraction: z.number().optional(),
  resetTime: z.string().optional(),
  tokenType: z.string().optional(),
  modelId: z.string().optional(),
});
export type BucketInfo = z.infer<typeof BucketInfoSchema>;

export const RetrieveUserQuotaResponseSchema = z.object({
  buckets: z.array(BucketInfoSchema).optional(),
});
export type RetrieveUserQuotaResponse = z.infer<
  typeof RetrieveUserQuotaResponseSchema
>;

export interface RecordCodeAssistMetricsRequest {
  project: string;
  requestId?: string;
  metadata?: ClientMetadata;
  metrics?: CodeAssistMetric[];
}

export interface CodeAssistMetric {
  timestamp?: string;
  metricMetadata?: Map<string, string>;

  // The event tied to this metric. Only one of these should be set.
  conversationOffered?: ConversationOffered;
  conversationInteraction?: ConversationInteraction;
}

export enum ConversationInteractionInteraction {
  UNKNOWN = 0,
  THUMBSUP = 1,
  THUMBSDOWN = 2,
  COPY = 3,
  INSERT = 4,
  ACCEPT_CODE_BLOCK = 5,
  ACCEPT_ALL = 6,
  ACCEPT_FILE = 7,
  DIFF = 8,
  ACCEPT_RANGE = 9,
}

export enum ActionStatus {
  ACTION_STATUS_UNSPECIFIED = 0,
  ACTION_STATUS_NO_ERROR = 1,
  ACTION_STATUS_ERROR_UNKNOWN = 2,
  ACTION_STATUS_CANCELLED = 3,
  ACTION_STATUS_EMPTY = 4,
}

export enum InitiationMethod {
  INITIATION_METHOD_UNSPECIFIED = 0,
  TAB = 1,
  COMMAND = 2,
  AGENT = 3,
}

export interface ConversationOffered {
  citationCount?: string;
  includedCode?: boolean;
  status?: ActionStatus;
  traceId?: string;
  streamingLatency?: StreamingLatency;
  isAgentic?: boolean;
  initiationMethod?: InitiationMethod;
}

export interface StreamingLatency {
  firstMessageLatency?: string;
  totalLatency?: string;
}

export interface ConversationInteraction {
  traceId: string;
  status?: ActionStatus;
  interaction?: ConversationInteractionInteraction;
  acceptedLines?: string;
  language?: string;
  isAgentic?: boolean;
}

export interface FetchAdminControlsRequest {
  project: string;
}

const ExtensionsSettingSchema = z.object({
  extensionsEnabled: z.boolean().optional(),
});

const CliFeatureSettingSchema = z.object({
  extensionsSetting: ExtensionsSettingSchema.optional(),
  unmanagedCapabilitiesEnabled: z.boolean().optional(),
});

const McpServerConfigSchema = z.object({
  url: z.string().optional(),
  type: z.enum(['sse', 'http']).optional(),
  trust: z.boolean().optional(),
  includeTools: z.array(z.string()).optional(),
  excludeTools: z.array(z.string()).optional(),
});

export const McpConfigDefinitionSchema = z.object({
  mcpServers: z.record(McpServerConfigSchema).optional(),
});

export type McpConfigDefinition = z.infer<typeof McpConfigDefinitionSchema>;

const McpSettingSchema = z.object({
  mcpEnabled: z.boolean().optional(),
  mcpConfigJson: z.string().optional(),
});

// Schema for internal application use (parsed mcpConfig)
export const AdminControlsSettingsSchema = z.object({
  strictModeDisabled: z.boolean().optional(),
  mcpSetting: z
    .object({
      mcpEnabled: z.boolean().optional(),
      mcpConfig: McpConfigDefinitionSchema.optional(),
    })
    .optional(),
  cliFeatureSetting: CliFeatureSettingSchema.optional(),
});

export type AdminControlsSettings = z.infer<typeof AdminControlsSettingsSchema>;

export const FetchAdminControlsResponseSchema = z.object({
  // TODO: deprecate once backend stops sending this field
  secureModeEnabled: z.boolean().optional(),
  strictModeDisabled: z.boolean().optional(),
  mcpSetting: McpSettingSchema.optional(),
  cliFeatureSetting: CliFeatureSettingSchema.optional(),
});

export type FetchAdminControlsResponse = z.infer<
  typeof FetchAdminControlsResponseSchema
>;

export const RecordCodeAssistMetricsResponseSchema = z.any();
