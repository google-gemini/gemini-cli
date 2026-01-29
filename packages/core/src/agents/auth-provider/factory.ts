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

/**
 * Options for creating an auth provider.
 */
export interface CreateAuthProviderOptions {
  /**
   * Name of the agent (for error messages and token storage).
   */
  agentName: string;

  /**
   * Auth configuration from the agent definition frontmatter.
   */
  authConfig?: A2AAuthConfig;

  /**
   * The fetched AgentCard with securitySchemes.
   */
  agentCard?: AgentCard;
}

/**
 * Factory for creating A2A authentication providers.
 * @see https://a2a-protocol.org/latest/specification/#451-securityscheme
 */
export class A2AAuthProviderFactory {
  /**
   * Create an auth provider from configuration.
   *
   * @param options Creation options including agent name and config
   * @returns The created auth provider, or undefined if no auth is needed
   */
  static async create(
    options: CreateAuthProviderOptions,
  ): Promise<A2AAuthProvider | undefined> {
    const { agentName: _agentName, authConfig, agentCard } = options;

    // If no auth config, check if the AgentCard requires auth
    if (!authConfig) {
      if (
        agentCard?.securitySchemes &&
        Object.keys(agentCard.securitySchemes).length > 0
      ) {
        // AgentCard requires auth but none configured
        // The caller should handle this case by prompting the user
        return undefined;
      }
      return undefined;
    }

    // Create provider based on config type
    // Providers are lazy-loaded to support incremental implementation
    switch (authConfig.type) {
      case 'google-credentials':
        // TODO: Implement
        throw new Error('google-credentials auth provider not yet implemented');

      case 'apiKey': {
        const { ApiKeyAuthProvider } = await import('./api-key-provider.js');
        const provider = new ApiKeyAuthProvider(authConfig);
        await provider.initialize();
        return provider;
      }

      case 'http': {
        const { HttpAuthProvider } = await import('./http-auth-provider.js');
        const provider = new HttpAuthProvider(authConfig);
        await provider.initialize();
        return provider;
      }

      case 'oauth2':
        // TODO: Implement
        throw new Error('oauth2 auth provider not yet implemented');

      case 'openIdConnect':
        // TODO: Implement
        throw new Error('openIdConnect auth provider not yet implemented');

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = authConfig;
        throw new Error(
          `Unknown auth type: ${(_exhaustive as A2AAuthConfig).type}`,
        );
      }
    }
  }

  /**
   * Create an auth provider directly from a config (for AgentCard fetching).
   * This bypasses AgentCard-based validation since we need auth to fetch the card.
   *
   * @param agentName Name of the agent
   * @param authConfig Auth configuration
   * @returns The created auth provider
   */
  static async createFromConfig(
    agentName: string,
    authConfig: A2AAuthConfig,
  ): Promise<A2AAuthProvider> {
    const provider = await A2AAuthProviderFactory.create({
      agentName,
      authConfig,
    });

    if (!provider) {
      throw new Error(
        `Failed to create auth provider for config type: ${authConfig.type}`,
      );
    }

    return provider;
  }

  /**
   * Validate that the auth configuration satisfies the AgentCard's security requirements.
   *
   * @param authConfig The configured auth from agent-definition
   * @param securitySchemes The security schemes declared in the AgentCard
   * @returns Validation result with diff if invalid
   */
  static validateAuthConfig(
    authConfig: A2AAuthConfig | undefined,
    securitySchemes: Record<string, SecurityScheme> | undefined,
  ): AuthValidationResult {
    // If no security schemes required, any config is valid
    if (!securitySchemes || Object.keys(securitySchemes).length === 0) {
      return { valid: true };
    }

    const requiredSchemes = Object.keys(securitySchemes);

    // If auth is required but none configured
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

    // Check if the configured type matches any of the required schemes
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
            // Check if the scheme matches (Bearer, Basic, etc.)
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
            // Google credentials can provide Bearer tokens
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
          // Google credentials with target_audience can work as OIDC
          if (
            authConfig.type === 'google-credentials' &&
            authConfig.target_audience
          ) {
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

  /**
   * Get a human-readable description of required auth for an AgentCard.
   */
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
          descriptions.push(
            `Unknown (${name}): ${(_exhaustive as SecurityScheme).type}`,
          );
        }
      }
    }

    return descriptions.join(' OR ');
  }
}
