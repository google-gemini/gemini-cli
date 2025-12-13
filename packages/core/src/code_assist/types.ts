/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
 * Represents LoadCodeAssistResponse proto json field
 * http://google3/google/internal/cloud/code/v1internal/cloudcode.proto;l=224
 */
export interface LoadCodeAssistResponse {
  currentTier?: GeminiUserTier | null;
  allowedTiers?: GeminiUserTier[] | null;
  ineligibleTiers?: IneligibleTier[] | null;
  cloudaicompanionProject?: string | null;
}

/**
 * GeminiUserTier reflects the structure received from the CodeAssist when calling LoadCodeAssist.
 */
export interface GeminiUserTier {
  id: UserTierId;
  name?: string;
  description?: string;
  // This value is used to declare whether a given tier requires the user to configure the project setting on the IDE settings or not.
  userDefinedCloudaicompanionProject?: boolean | null;
  isDefault?: boolean;
  privacyNotice?: PrivacyNotice;
  hasAcceptedTos?: boolean;
  hasOnboardedPreviously?: boolean;
}

/**
 * Includes information specifying the reasons for a user's ineligibility for a specific tier.
 * @param reasonCode mnemonic code representing the reason for in-eligibility.
 * @param reasonMessage message to display to the user.
 * @param tierId id of the tier.
 * @param tierName name of the tier.
 */
export interface IneligibleTier {
  reasonCode: IneligibleTierReasonCode;
  reasonMessage: string;
  tierId: UserTierId;
  tierName: string;
}

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
  // go/keep-sorted end
}
/**
 * UserTierId represents IDs returned from the Cloud Code Private API representing a user's tier
 *
 * //depot/google3/cloud/developer_experience/cloudcode/pa/service/usertier.go;l=16
 */
export enum UserTierId {
  FREE = 'free-tier',
  LEGACY = 'legacy-tier',
  STANDARD = 'standard-tier',
}

/**
 * PrivacyNotice reflects the structure received from the CodeAssist in regards to a tier
 * privacy notice.
 */
export interface PrivacyNotice {
  showNotice: boolean;
  noticeText?: string;
}

/**
 * Proto signature of OnboardUserRequest as payload to OnboardUser call
 */
export interface OnboardUserRequest {
  tierId: string | undefined;
  cloudaicompanionProject: string | undefined;
  metadata: ClientMetadata | undefined;
}

/**
 * Represents LongRunningOperation proto
 * http://google3/google/longrunning/operations.proto;rcl=698857719;l=107
 */
export interface LongRunningOperationResponse {
  name: string;
  done?: boolean;
  response?: OnboardUserResponse;
}

/**
 * Represents OnboardUserResponse proto
 * http://google3/google/internal/cloud/code/v1internal/cloudcode.proto;l=215
 */
export interface OnboardUserResponse {
  // tslint:disable-next-line:enforce-name-casing This is the name of the field in the proto.
  cloudaicompanionProject?: {
    id: string;
    name: string;
  };
}

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

export interface CodeAssistGlobalUserSettingResponse {
  cloudaicompanionProject?: string;
  freeTierDataCollectionOptin: boolean;
}

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

export interface BucketInfo {
  remainingAmount?: string;
  remainingFraction?: number;
  resetTime?: string;
  tokenType?: string;
  modelId?: string;
}

export interface RetrieveUserQuotaResponse {
  buckets?: BucketInfo[];
}

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
  inlineCompletionAccepted?: InlineCompletionAccepted;
  inlineCompletionOffered?: InlineCompletionOffered;
  conversationOffered?: ConversationOffered;
  generateCodeUI?: GenerateCodeUI;
  conversationExplainUI?: ConversationExplainUI;
  conversationGenerateTestUI?: ConversationGenerateTestUI;
  conversationInteraction?: ConversationInteraction;
  aiCharactersReports?: AiCharactersReports;
}

export enum ConversationInteractionType {
  UNSPECIFIED = 'INTERACTION_TYPE_UNSPECIFIED',
  ACCEPTANCE = 'ACCEPTANCE',
  DISMISSAL = 'DISMISSAL',
}

export enum InlineCompletionAcceptedCompletionMethod {
  UNKNOWN = 0,
  GENERATE_CODE = 1,
  COMPLETE_CODE = 2,
  TRANSFORM_CODE = 3,
  AUTOMATIC_GENERATION = 4,
}

export enum InlineCompletionOfferedCompletionMode {
  UNKNOWN = 0,
  LANGUAGE_CLIENT = 1,
  TYPEOVER = 2,
  TYPEOVER_NEWLINE = 3,
  TRANSFORM_CODE = 4,
}

export enum InlineCompletionOfferedCompletionMethod {
  COMPLETION_METHOD_UNKNOWN = 0,
  COMPLETION_METHOD_GENERATE_CODE = 1,
  COMPLETION_METHOD_COMPLETE_CODE = 2,
  COMPLETION_METHOD_TRANSFORM_CODE = 3,
  COMPLETION_METHOD_AUTOMATIC_GENERATION = 4,
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

export enum AiCharactersReportEditType {
  EDIT_TYPE_UNSPECIFIED = 0,
  USER_ADD = 1,
  PASTE = 2,
  DELETE = 3,
  OTHER = 4,
  AI_COMPLETION = 5,
  AI_COMPLETION_PARTIAL = 6,
  AI_GENERATION = 7,
  AI_GENERATION_PARTIAL = 8,
}

export enum ActionStatus {
  ACTION_STATUS_UNSPECIFIED = 0,
  ACTION_STATUS_NO_ERROR = 1,
  ACTION_STATUS_ERROR_UNKNOWN = 2,
  ACTION_STATUS_CANCELLED = 3,
  ACTION_STATUS_EMPTY = 4,
}

export interface InlineCompletionAccepted {
  traceId?: string;
  score?: number;
  responseSize?: string;
  responseLines?: string;
  language?: string;
  completionMethod?: InlineCompletionAcceptedCompletionMethod;
  partialAcceptedCharacters?: string;
  partialAcceptedLines?: string;
  acceptedCommentLines?: string;
  status?: ActionStatus;
  responseAcceptedIndex?: string;
}

export interface InlineCompletionOffered {
  traceId?: string;
  resultCount?: string;
  language?: string;
  completionMode?: InlineCompletionOfferedCompletionMode;
  displayLength?: string;
  status?: ActionStatus;
  completionMethod?: InlineCompletionOfferedCompletionMethod;
  responseLatency?: string;
  responseReceivedIndex?: string;
}

export interface ConversationOffered {
  citationCount?: string;
  includedCode?: boolean;
  status?: ActionStatus;
  traceId?: string;
  streamingLatency?: StreamingLatency;
  isAgentic?: boolean;
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

export type GenerateCodeUI = Record<string, never>;

export type ConversationExplainUI = Record<string, never>;

export type ConversationGenerateTestUI = Record<string, never>;

export interface AiCharactersReports {
  reports: AiCharactersReport[];
}

export interface AiCharactersReport {
  language: string;
  editType: AiCharactersReportEditType;
  totalChars: string;
  whitespaceChars: string;
  timeIntervalIndex: string;
}
