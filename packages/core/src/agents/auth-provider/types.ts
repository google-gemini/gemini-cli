/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client-side auth configuration for A2A remote agents.
 * Corresponds to server-side SecurityScheme types from @a2a-js/sdk.
 * @see https://a2a-protocol.org/latest/specification/#451-securityscheme
 */

import type { AuthenticationHandler } from '@a2a-js/sdk/client';

export type A2AAuthProviderType =
  | 'google-credentials'
  | 'apiKey'
  | 'http'
  | 'oauth2'
  | 'openIdConnect';

export interface A2AAuthProvider extends AuthenticationHandler {
  readonly type: A2AAuthProviderType;
  initialize?(): Promise<void>;
}

export interface BaseAuthConfig {
  agent_card_requires_auth?: boolean;
}

/** Client config for google-credentials (not in A2A spec, Gemini-specific). */
export interface GoogleCredentialsAuthConfig extends BaseAuthConfig {
  type: 'google-credentials';
  scopes?: string[];
}

/** Client config corresponding to APIKeySecurityScheme. Only header location is supported. */
// TODO: Add 'query' and 'cookie' location support if needed.
export interface ApiKeyAuthConfig extends BaseAuthConfig {
  type: 'apiKey';
  /** The secret. Supports $ENV_VAR, !command, or literal. */
  key: string;
  /** Header name. @default 'X-API-Key' */
  name?: string;
}

/** Client config corresponding to HTTPAuthSecurityScheme. */
export type HttpAuthConfig = BaseAuthConfig & {
  type: 'http';
} & (
    | {
        scheme: 'Bearer';
        /** For Bearer. Supports $ENV_VAR, !command, or literal. */
        token: string;
      }
    | {
        scheme: 'Basic';
        /** For Basic. Supports $ENV_VAR, !command, or literal. */
        username: string;
        /** For Basic. Supports $ENV_VAR, !command, or literal. */
        password: string;
      }
  );

/** Client config corresponding to OAuth2SecurityScheme. */
export interface OAuth2AuthConfig extends BaseAuthConfig {
  type: 'oauth2';
  client_id?: string;
  client_secret?: string;
  scopes?: string[];
}

/** Client config corresponding to OpenIdConnectSecurityScheme. */
export interface OpenIdConnectAuthConfig extends BaseAuthConfig {
  type: 'openIdConnect';
  issuer_url: string;
  client_id: string;
  client_secret?: string;
  target_audience?: string;
  scopes?: string[];
}

export type A2AAuthConfig =
  | GoogleCredentialsAuthConfig
  | ApiKeyAuthConfig
  | HttpAuthConfig
  | OAuth2AuthConfig
  | OpenIdConnectAuthConfig;

export interface AuthConfigDiff {
  requiredSchemes: string[];
  configuredType?: A2AAuthProviderType;
  missingConfig: string[];
}

export interface AuthValidationResult {
  valid: boolean;
  diff?: AuthConfigDiff;
}
