/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentCard, SecurityScheme } from '@a2a-js/sdk';
import type {
  A2AAuthConfig,
  A2AAuthProvider,
  AuthValidationResult,
} from './types.js';
import { ApiKeyAuthProvider } from './api-key-provider.js';

export interface CreateAuthProviderOptions {
  /** Required for OAuth/OIDC token storage. */
  agentName?: string;
  authConfig?: A2AAuthConfig;
  agentCard?: AgentCard;
}

/**
 * Factory for creating A2A authentication providers.
 * @see https://a2a-protocol.org/latest/specification/#451-securityscheme
 */
export class A2AAuthProviderFactory {
  static async create(
    options: CreateAuthProviderOptions,
  ): Promise<A2AAuthProvider | undefined> {
    const { agentName: _agentName, authConfig, agentCard } = options;

    if (!authConfig) {
      if (
        agentCard?.securitySchemes &&
        Object.keys(agentCard.securitySchemes).length > 0
      ) {
        return undefined; // Caller should prompt user to configure auth
      }
      return undefined;
    }

    switch (authConfig.type) {
      case 'google-credentials':
        // TODO: Implement
        throw new Error('google-credentials auth provider not yet implemented');

      case 'apiKey': {
        const provider = new ApiKeyAuthProvider(authConfig);
        await provider.initialize();
        return provider;
      }

      case 'http':
        // TODO: Implement
        throw new Error('http auth provider not yet implemented');

      case 'oauth2':
        // TODO: Implement
        throw new Error('oauth2 auth provider not yet implemented');

      case 'openIdConnect':
        // TODO: Implement
        throw new Error('openIdConnect auth provider not yet implemented');

      default: {
        const _exhaustive: never = authConfig;
        throw new Error(
          `Unknown auth type: ${(_exhaustive as A2AAuthConfig).type}`,
        );
      }
    }
  }

  /** Create provider directly from config, bypassing AgentCard validation. */
  static async createFromConfig(
    authConfig: A2AAuthConfig,
    agentName?: string,
  ): Promise<A2AAuthProvider> {
    const provider = await A2AAuthProviderFactory.create({
      authConfig,
      agentName,
    });

    // create() returns undefined only when authConfig is missing.
    // Since authConfig is required here, provider will always be defined
    // (or create() throws for unimplemented types).
    return provider!;
  }

  /** Validate auth config against AgentCard's security requirements. */
  static validateAuthConfig(
    authConfig: A2AAuthConfig | undefined,
    securitySchemes: Record<string, SecurityScheme> | undefined,
  ): AuthValidationResult {
    if (!securitySchemes || Object.keys(securitySchemes).length === 0) {
      return { valid: true };
    }

    const requiredSchemes = Object.keys(securitySchemes);

    if (!authConfig) {
      return {
        valid: false,
        diff: {
          requiredSchemes,
          configuredType: undefined,
          missingConfig: ['Authentication is required but not configured'],
        },
      };
    }

    const matchResult = A2AAuthProviderFactory.findMatchingScheme(
      authConfig,
      securitySchemes,
    );

    if (matchResult.matched) {
      return { valid: true };
    }

    return {
      valid: false,
      diff: {
        requiredSchemes,
        configuredType: authConfig.type,
        missingConfig: matchResult.missingConfig,
      },
    };
  }

  // Security schemes have OR semantics per A2A spec - matching any single scheme is sufficient
  private static findMatchingScheme(
    authConfig: A2AAuthConfig,
    securitySchemes: Record<string, SecurityScheme>,
  ): { matched: boolean; missingConfig: string[] } {
    const missingConfig: string[] = [];

    for (const [schemeName, scheme] of Object.entries(securitySchemes)) {
      switch (scheme.type) {
        case 'apiKey':
          if (authConfig.type === 'apiKey') {
            return { matched: true, missingConfig: [] };
          }
          missingConfig.push(
            `Scheme '${schemeName}' requires apiKey authentication`,
          );
          break;

        case 'http':
          if (authConfig.type === 'http') {
            if (
              authConfig.scheme.toLowerCase() === scheme.scheme.toLowerCase()
            ) {
              return { matched: true, missingConfig: [] };
            }
            missingConfig.push(
              `Scheme '${schemeName}' requires HTTP ${scheme.scheme} authentication, but ${authConfig.scheme} was configured`,
            );
          } else if (
            authConfig.type === 'google-credentials' &&
            scheme.scheme.toLowerCase() === 'bearer'
          ) {
            return { matched: true, missingConfig: [] };
          } else {
            missingConfig.push(
              `Scheme '${schemeName}' requires HTTP ${scheme.scheme} authentication`,
            );
          }
          break;

        case 'oauth2':
          if (authConfig.type === 'oauth2') {
            return { matched: true, missingConfig: [] };
          }
          missingConfig.push(
            `Scheme '${schemeName}' requires OAuth 2.0 authentication`,
          );
          break;

        case 'openIdConnect':
          if (authConfig.type === 'openIdConnect') {
            return { matched: true, missingConfig: [] };
          }
          missingConfig.push(
            `Scheme '${schemeName}' requires OpenID Connect authentication`,
          );
          break;

        case 'mutualTLS':
          missingConfig.push(
            `Scheme '${schemeName}' requires mTLS authentication (not yet supported)`,
          );
          break;

        default: {
          const _exhaustive: never = scheme;
          missingConfig.push(
            `Unknown security scheme type: ${(_exhaustive as SecurityScheme).type}`,
          );
        }
      }
    }

    return { matched: false, missingConfig };
  }

  /** Get human-readable description of required auth for error messages. */
  static describeRequiredAuth(
    securitySchemes: Record<string, SecurityScheme>,
  ): string {
    const descriptions: string[] = [];

    for (const [name, scheme] of Object.entries(securitySchemes)) {
      switch (scheme.type) {
        case 'apiKey':
          descriptions.push(
            `API Key (${name}): Send ${scheme.name} in ${scheme.in}`,
          );
          break;
        case 'http':
          descriptions.push(`HTTP ${scheme.scheme} (${name})`);
          break;
        case 'oauth2':
          descriptions.push(`OAuth 2.0 (${name})`);
          break;
        case 'openIdConnect':
          descriptions.push(`OpenID Connect (${name})`);
          break;
        case 'mutualTLS':
          descriptions.push(`Mutual TLS (${name})`);
          break;
        default: {
          const _exhaustive: never = scheme;
          // This ensures TypeScript errors if a new SecurityScheme type is added
          descriptions.push(
            `Unknown (${name}): ${(_exhaustive as SecurityScheme).type}`,
          );
        }
      }
    }

    return descriptions.join(' OR ');
  }
}
