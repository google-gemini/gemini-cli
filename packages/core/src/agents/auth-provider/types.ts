/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AuthenticationHandler, HttpHeaders } from '@a2a-js/sdk/client';

/**
 * Authentication provider types supported for A2A remote agents.
 * These align with the SecurityScheme types from the A2A specification.
 */
export type A2AAuthProviderType =
  | 'google-credentials'
  | 'apiKey'
  | 'http'
  | 'oauth2'
  | 'openIdConnect';

/**
 * Extended authentication handler interface for A2A remote agents.
 * Extends the base AuthenticationHandler from the A2A SDK with
 * lifecycle management methods.
 */
export interface A2AAuthProvider extends AuthenticationHandler {
  readonly type: A2AAuthProviderType;
  initialize?(): Promise<void>;
  dispose?(): Promise<void>;
}

/**
 * Base configuration shared by all auth types.
 */
export interface BaseAuthConfig {
  /**
   * If true, use this auth configuration to fetch the AgentCard.
   * Required when the AgentCard endpoint itself requires authentication.
   */
  agent_card_requires_auth?: boolean;
}

/**
 * Configuration for Google Application Default Credentials (ADC).
 */
export interface GoogleCredentialsAuthConfig extends BaseAuthConfig {
  type: 'google-credentials';
  /** OAuth scopes to request. */
  scopes?: string[];
  /** Target audience for ID token requests (e.g., Cloud Run URL). */
  target_audience?: string;
}

/**
 * Configuration for API Key authentication.
 */
export interface ApiKeyAuthConfig extends BaseAuthConfig {
  type: 'apiKey';
  /** The API key. Supports $ENV_VAR, !command, or literal value. */
  key: string;
  /** Where to include the key. @default 'header' */
  in?: 'header' | 'query' | 'cookie';
  /** Header/param/cookie name. @default 'X-API-Key' for header */
  name?: string;
}

/**
 * Configuration for HTTP authentication (Bearer or Basic).
 */
export interface HttpAuthConfig extends BaseAuthConfig {
  type: 'http';
  scheme: 'Bearer' | 'Basic';
  /** Bearer token. Supports $ENV_VAR, !command, or literal. */
  token?: string;
  /** Basic auth username. Supports $ENV_VAR and !command. */
  username?: string;
  /** Basic auth password. Supports $ENV_VAR and !command. */
  password?: string;
}

/**
 * Configuration for OAuth 2.0 authentication.
 */
export interface OAuth2AuthConfig extends BaseAuthConfig {
  type: 'oauth2';
  client_id?: string;
  client_secret?: string;
  scopes?: string[];
}

/**
 * Configuration for OpenID Connect authentication.
 */
export interface OpenIdConnectAuthConfig extends BaseAuthConfig {
  type: 'openIdConnect';
  /** OIDC issuer URL for discovery. */
  issuer_url: string;
  client_id: string;
  client_secret?: string;
  target_audience?: string;
  scopes?: string[];
}

/**
 * Union type of all supported A2A authentication configurations.
 */
export type A2AAuthConfig =
  | GoogleCredentialsAuthConfig
  | ApiKeyAuthConfig
  | HttpAuthConfig
  | OAuth2AuthConfig
  | OpenIdConnectAuthConfig;

/**
 * Describes a mismatch between configured auth and AgentCard requirements.
 */
export interface AuthConfigDiff {
  requiredSchemes: string[];
  configuredType?: A2AAuthProviderType;
  missingConfig: string[];
}

/**
 * Result of validating auth configuration against AgentCard requirements.
 */
export interface AuthValidationResult {
  valid: boolean;
  diff?: AuthConfigDiff;
}

export type { AuthenticationHandler, HttpHeaders };
