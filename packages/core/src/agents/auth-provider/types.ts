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
  /**
   * The type of authentication provider.
   */
  readonly type: A2AAuthProviderType;

  /**
   * Initialize the provider. Called before first use.
   * For OAuth/OIDC, this may trigger discovery or browser-based auth.
   */
  initialize?(): Promise<void>;

  /**
   * Clean up any resources held by the provider.
   */
  dispose?(): Promise<void>;
}

// ============================================================================
// Base configuration interface
// ============================================================================

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

// ============================================================================
// Google Credentials configuration
// ============================================================================

/**
 * Configuration for Google Application Default Credentials (ADC).
 */
export interface GoogleCredentialsAuthConfig extends BaseAuthConfig {
  type: 'google-credentials';

  /**
   * OAuth scopes to request. Required for access tokens.
   * @example ['https://www.googleapis.com/auth/cloud-platform']
   */
  scopes?: string[];

  /**
   * Target audience for ID token requests.
   * When specified, an ID token is requested instead of an access token.
   * Typically the URL of the Cloud Run service or other GCP resource.
   * @example 'https://my-agent.run.app'
   */
  target_audience?: string;
}

// ============================================================================
// API Key configuration
// ============================================================================

/**
 * Configuration for API Key authentication.
 * The API key can be sent in a header, query parameter, or cookie.
 */
export interface ApiKeyAuthConfig extends BaseAuthConfig {
  type: 'apiKey';

  /**
   * The API key value. Supports:
   * - `$ENV_VAR`: Read from environment variable
   * - `!command`: Execute shell command and use output
   * - Literal string value
   */
  key: string;

  /**
   * Where to include the API key in requests.
   * @default 'header'
   */
  in?: 'header' | 'query' | 'cookie';

  /**
   * The name of the header, query parameter, or cookie.
   * @default 'X-API-Key' for header, 'api_key' for query/cookie
   */
  name?: string;
}

// ============================================================================
// HTTP Auth configuration
// ============================================================================

/**
 * Configuration for HTTP authentication (Bearer or Basic).
 */
export interface HttpAuthConfig extends BaseAuthConfig {
  type: 'http';

  /**
   * The HTTP authentication scheme.
   */
  scheme: 'Bearer' | 'Basic';

  /**
   * The token for Bearer authentication. Supports:
   * - `$ENV_VAR`: Read from environment variable
   * - `!command`: Execute shell command and use output
   * - Literal string value
   */
  token?: string;

  /**
   * Username for Basic authentication. Supports $ENV_VAR and !command.
   */
  username?: string;

  /**
   * Password for Basic authentication. Supports $ENV_VAR and !command.
   */
  password?: string;
}

// ============================================================================
// OAuth 2.0 configuration
// ============================================================================

/**
 * Configuration for OAuth 2.0 authentication.
 * Endpoints can be discovered from the AgentCard's securitySchemes.
 */
export interface OAuth2AuthConfig extends BaseAuthConfig {
  type: 'oauth2';

  /**
   * Client ID for OAuth. Supports $ENV_VAR and !command.
   */
  client_id?: string;

  /**
   * Client secret for OAuth. Supports $ENV_VAR and !command.
   * May be omitted for public clients using PKCE.
   */
  client_secret?: string;

  /**
   * OAuth scopes to request.
   */
  scopes?: string[];
}

// ============================================================================
// OpenID Connect configuration
// ============================================================================

/**
 * Configuration for OpenID Connect authentication.
 * This is a generic OIDC provider that works with any compliant issuer
 * (Auth0, Okta, Keycloak, Google, etc.).
 */
export interface OpenIdConnectAuthConfig extends BaseAuthConfig {
  type: 'openIdConnect';

  /**
   * The OIDC issuer URL for discovery.
   * Used to fetch the .well-known/openid-configuration.
   * @example 'https://auth.example.com'
   */
  issuer_url: string;

  /**
   * Client ID for OIDC. Supports $ENV_VAR and !command.
   */
  client_id: string;

  /**
   * Client secret for OIDC. Supports $ENV_VAR and !command.
   * May be omitted for public clients.
   */
  client_secret?: string;

  /**
   * Target audience for ID token requests.
   * @example 'https://protected-agent.example.com'
   */
  target_audience?: string;

  /**
   * OAuth scopes to request.
   * @default ['openid']
   */
  scopes?: string[];
}

// ============================================================================
// Union type for all auth configs
// ============================================================================

/**
 * Union type of all supported A2A authentication configurations.
 */
export type A2AAuthConfig =
  | GoogleCredentialsAuthConfig
  | ApiKeyAuthConfig
  | HttpAuthConfig
  | OAuth2AuthConfig
  | OpenIdConnectAuthConfig;

// ============================================================================
// Auth validation types
// ============================================================================

/**
 * Describes a mismatch between configured auth and AgentCard requirements.
 */
export interface AuthConfigDiff {
  /**
   * Security scheme names required by the AgentCard.
   */
  requiredSchemes: string[];

  /**
   * The auth type configured in the agent definition, if any.
   */
  configuredType?: A2AAuthProviderType;

  /**
   * Description of what's missing to satisfy the requirements.
   */
  missingConfig: string[];
}

/**
 * Result of validating auth configuration against AgentCard requirements.
 */
export interface AuthValidationResult {
  /**
   * Whether the configuration is valid for the AgentCard's requirements.
   */
  valid: boolean;

  /**
   * Details about the mismatch, if any.
   */
  diff?: AuthConfigDiff;
}

// ============================================================================
// Re-export useful types from the SDK
// ============================================================================

export type { AuthenticationHandler, HttpHeaders };
