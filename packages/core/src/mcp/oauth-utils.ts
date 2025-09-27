/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MCPOAuthConfig } from './oauth-provider.js';
import { getErrorMessage } from '../utils/errors.js';

/**
 * OAuth authorization server metadata as per RFC 8414.
 */
export interface OAuthAuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  token_endpoint_auth_methods_supported?: string[];
  revocation_endpoint?: string;
  revocation_endpoint_auth_methods_supported?: string[];
  registration_endpoint?: string;
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
}

/**
 * OAuth protected resource metadata as per RFC 9728.
 */
export interface OAuthProtectedResourceMetadata {
  resource: string;
  authorization_servers?: string[];
  bearer_methods_supported?: string[];
  resource_documentation?: string;
  resource_signing_alg_values_supported?: string[];
  resource_encryption_alg_values_supported?: string[];
  resource_encryption_enc_values_supported?: string[];
}

/**
 * Utility class for common OAuth operations.
 */
export class OAuthUtils {
  /**
   * Construct well-known OAuth endpoint URLs.
   * By default, uses standard root-based well-known URLs.
   * If includePathSuffix is true, appends any path from the base URL to the well-known endpoints.
   */
  static buildWellKnownUrls(baseUrl: string, includePathSuffix = false) {
    const serverUrl = new URL(baseUrl);
    const base = `${serverUrl.protocol}//${serverUrl.host}`;

    if (!includePathSuffix) {
      // Standard discovery: use root-based well-known URLs
      return {
        protectedResource: new URL(
          '/.well-known/oauth-protected-resource',
          base,
        ).toString(),
        authorizationServer: new URL(
          '/.well-known/oauth-authorization-server',
          base,
        ).toString(),
      };
    }

    // Path-based discovery: append path suffix to well-known URLs
    const pathSuffix = serverUrl.pathname.replace(/\/$/, ''); // Remove trailing slash
    return {
      protectedResource: new URL(
        `/.well-known/oauth-protected-resource${pathSuffix}`,
        base,
      ).toString(),
      authorizationServer: new URL(
        `/.well-known/oauth-authorization-server${pathSuffix}`,
        base,
      ).toString(),
    };
  }

  /**
   * Fetch OAuth protected resource metadata.
   *
   * @param resourceMetadataUrl The protected resource metadata URL
   * @returns The protected resource metadata or null if not available
   */
  static async fetchProtectedResourceMetadata(
    resourceMetadataUrl: string,
  ): Promise<OAuthProtectedResourceMetadata | null> {
    try {
      const response = await fetch(resourceMetadataUrl);
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as OAuthProtectedResourceMetadata;
    } catch (error) {
      console.debug(
        `Failed to fetch protected resource metadata from ${resourceMetadataUrl}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Fetch OAuth authorization server metadata.
   *
   * @param authServerMetadataUrl The authorization server metadata URL
   * @returns The authorization server metadata or null if not available
   */
  static async fetchAuthorizationServerMetadata(
    authServerMetadataUrl: string,
  ): Promise<OAuthAuthorizationServerMetadata | null> {
    try {
      const response = await fetch(authServerMetadataUrl);
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as OAuthAuthorizationServerMetadata;
    } catch (error) {
      console.debug(
        `Failed to fetch authorization server metadata from ${authServerMetadataUrl}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Convert authorization server metadata to OAuth configuration.
   *
   * @param metadata The authorization server metadata
   * @returns The OAuth configuration
   */
  static metadataToOAuthConfig(
    metadata: OAuthAuthorizationServerMetadata,
  ): MCPOAuthConfig {
    return {
      authorizationUrl: metadata.authorization_endpoint,
      tokenUrl: metadata.token_endpoint,
      scopes: metadata.scopes_supported || [],
      registrationUrl: metadata.registration_endpoint,
    };
  }

  /**
   * Discover Oauth Authorization server metadata given an Auth server URL, by
   * trying the standard well-known endpoints.
   *
   * @param authServerUrl The authorization server URL
   * @returns The authorization server metadata or null if not found
   */
  static async discoverAuthorizationServerMetadata(
    authServerUrl: string,
  ): Promise<OAuthAuthorizationServerMetadata | null> {
    const authServerUrlObj = new URL(authServerUrl);
    const base = `${authServerUrlObj.protocol}//${authServerUrlObj.host}`;

    const endpointsToTry: string[] = [];

    // With issuer URLs with path components, try the following well-known
    // endpoints in order:
    if (authServerUrlObj.pathname !== '/') {
      // 1. OAuth 2.0 Authorization Server Metadata with path insertion
      endpointsToTry.push(
        new URL(
          `/.well-known/oauth-authorization-server${authServerUrlObj.pathname}`,
          base,
        ).toString(),
      );

      // 2. OpenID Connect Discovery 1.0 with path insertion
      endpointsToTry.push(
        new URL(
          `/.well-known/openid-configuration${authServerUrlObj.pathname}`,
          base,
        ).toString(),
      );

      // 3. OpenID Connect Discovery 1.0 with path appending
      endpointsToTry.push(
        new URL(
          `${authServerUrlObj.pathname}/.well-known/openid-configuration`,
          base,
        ).toString(),
      );
    }

    // With issuer URLs without path components, and those that failed previous
    // discoveries, try the following well-known endpoints in order:

    // 1. OAuth 2.0 Authorization Server Metadata
    endpointsToTry.push(
      new URL('/.well-known/oauth-authorization-server', base).toString(),
    );

    // 2. OpenID Connect Discovery 1.0
    endpointsToTry.push(
      new URL('/.well-known/openid-configuration', base).toString(),
    );

    for (const endpoint of endpointsToTry) {
      const authServerMetadata =
        await this.fetchAuthorizationServerMetadata(endpoint);
      if (authServerMetadata) {
        return authServerMetadata;
      }
    }

    console.debug(
      `Metadata discovery failed for authorization server ${authServerUrl}`,
    );
    return null;
  }

  /**
   * Discover OAuth configuration using the standard well-known endpoints.
   *
   * @param serverUrl The base URL of the server
   * @returns The discovered OAuth configuration or null if not available
   */
  static async discoverOAuthConfig(
    serverUrl: string,
  ): Promise<MCPOAuthConfig | null> {
    try {
      // First try standard root-based discovery
      const wellKnownUrls = this.buildWellKnownUrls(serverUrl, false);

      // Try to get the protected resource metadata at root
      let resourceMetadata = await this.fetchProtectedResourceMetadata(
        wellKnownUrls.protectedResource,
      );

      // If root discovery fails and we have a path, try path-based discovery
      if (!resourceMetadata) {
        const url = new URL(serverUrl);
        if (url.pathname && url.pathname !== '/') {
          const pathBasedUrls = this.buildWellKnownUrls(serverUrl, true);
          resourceMetadata = await this.fetchProtectedResourceMetadata(
            pathBasedUrls.protectedResource,
          );
        }
      }

      if (resourceMetadata?.authorization_servers?.length) {
        // Use the first authorization server
        const authServerUrl = resourceMetadata.authorization_servers[0];
        const authServerMetadata =
          await this.discoverAuthorizationServerMetadata(authServerUrl);

        if (authServerMetadata) {
          const config = this.metadataToOAuthConfig(authServerMetadata);
          if (authServerMetadata.registration_endpoint) {
            console.log(
              'Dynamic client registration is supported at:',
              authServerMetadata.registration_endpoint,
            );
          }
          return config;
        }
      }

      // Fallback: try well-known endpoints at the base URL
      console.debug(`Trying OAuth discovery fallback at ${serverUrl}`);
      const authServerMetadata =
        await this.discoverAuthorizationServerMetadata(serverUrl);

      if (authServerMetadata) {
        const config = this.metadataToOAuthConfig(authServerMetadata);
        if (authServerMetadata.registration_endpoint) {
          console.log(
            'Dynamic client registration is supported at:',
            authServerMetadata.registration_endpoint,
          );
        }
        return config;
      }

      return null;
    } catch (error) {
      console.debug(
        `Failed to discover OAuth configuration: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Parse WWW-Authenticate header to extract OAuth information.
   *
   * @param header The WWW-Authenticate header value
   * @returns The resource metadata URI if found
   */
  static parseWWWAuthenticateHeader(header: string): string | null {
    // Parse Bearer realm and resource_metadata
    const match = header.match(/resource_metadata="([^"]+)"/);
    if (match) {
      return match[1];
    }
    return null;
  }

  /**
   * Discover OAuth configuration from WWW-Authenticate header.
   *
   * @param wwwAuthenticate The WWW-Authenticate header value
   * @returns The discovered OAuth configuration or null if not available
   */
  static async discoverOAuthFromWWWAuthenticate(
    wwwAuthenticate: string,
  ): Promise<MCPOAuthConfig | null> {
    const resourceMetadataUri =
      this.parseWWWAuthenticateHeader(wwwAuthenticate);
    if (!resourceMetadataUri) {
      return null;
    }

    const resourceMetadata =
      await this.fetchProtectedResourceMetadata(resourceMetadataUri);
    if (!resourceMetadata?.authorization_servers?.length) {
      return null;
    }

    const authServerUrl = resourceMetadata.authorization_servers[0];
    const authServerMetadata =
      await this.discoverAuthorizationServerMetadata(authServerUrl);

    if (authServerMetadata) {
      return this.metadataToOAuthConfig(authServerMetadata);
    }

    return null;
  }

  /**
   * Extract base URL from an MCP server URL.
   *
   * @param mcpServerUrl The MCP server URL
   * @returns The base URL
   */
  static extractBaseUrl(mcpServerUrl: string): string {
    const serverUrl = new URL(mcpServerUrl);
    return `${serverUrl.protocol}//${serverUrl.host}`;
  }

  /**
   * Check if a URL is an SSE endpoint.
   *
   * @param url The URL to check
   * @returns True if the URL appears to be an SSE endpoint
   */
  static isSSEEndpoint(url: string): boolean {
    return url.includes('/sse') || !url.includes('/mcp');
  }

  /**
   * Build a resource parameter for OAuth requests.
   *
   * @param endpointUrl The endpoint URL
   * @returns The resource parameter value
   */
  static buildResourceParameter(endpointUrl: string): string {
    const url = new URL(endpointUrl);
    return `${url.protocol}//${url.host}`;
  }
}
