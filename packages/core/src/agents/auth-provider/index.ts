/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Types
export type {
  A2AAuthProvider,
  A2AAuthProviderType,
  A2AAuthConfig,
  GoogleCredentialsAuthConfig,
  ApiKeyAuthConfig,
  HttpAuthConfig,
  OAuth2AuthConfig,
  OpenIdConnectAuthConfig,
  BaseAuthConfig,
  AuthConfigDiff,
  AuthValidationResult,
  AuthenticationHandler,
  HttpHeaders,
} from './types.js';

// Base class
export { BaseA2AAuthProvider } from './base-provider.js';

// Factory
export {
  A2AAuthProviderFactory,
  type CreateAuthProviderOptions,
} from './factory.js';

// Note: Individual providers are lazy-loaded by the factory.
// They will be exported as they are implemented in subsequent PRs.
