/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPOAuthConfig } from './oauth-provider.js';
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
   * Construct a new URL with a .well-known segment from an
   * existing URL, according to IETF RFC 8414 sec 3:
   *
   * Insert a well-known URI string into the authorization
   * server's issuer identifier between the host component and the path
   * component, if any.
   *
   * @param originalUrl The original URL
   * @param wellKnownSegment The well-known segment to insert
   * @returns The constructed URL
   */
  static constructRfc841WellKnownUrl(
    originalUrl: string,
    wellKnownSegment: string,
  ): string {
    const url = new URL(originalUrl);
    const base = `${url.protocol}//${url.host}`;
    return new URL(wellKnownSegment + url.pathname, base).toString();
  }

  /**
   * Construct well-known OAuth endpoint URLs.
   */
  static buildWellKnownUrls(baseUrl: string) {
    return {
      protectedResource: this.constructRfc841WellKnownUrl(
        baseUrl,
        '/.well-known/oauth-protected-resource',
      ),
      authorizationServer: this.constructRfc841WellKnownUrl(
        baseUrl,
        '/.well-known/oauth-authorization-server',
      ),
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
    };
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
      console.debug(`discoverOAuthConfig serverUrl: ${serverUrl}`);
      const wellKnownUrls = this.buildWellKnownUrls(serverUrl);
      console.debug(
        `Trying OAuth discovery via: ${wellKnownUrls.protectedResource}`,
      );

      // First, try to get the protected resource metadata
      const resourceMetadata = await this.fetchProtectedResourceMetadata(
        wellKnownUrls.protectedResource,
      );

      if (resourceMetadata?.authorization_servers?.length) {
        // Use the first authorization server
        const authServerMetadataUrl = this.constructRfc841WellKnownUrl(
          resourceMetadata.authorization_servers[0],
          '/.well-known/oauth-authorization-server',
        );
        console.debug(
          'Retrieving authz server metadata:',
          authServerMetadataUrl,
        );

        const authServerMetadata = await this.fetchAuthorizationServerMetadata(
          authServerMetadataUrl,
        );

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

      // Fallback: try /.well-known/oauth-authorization-server at the base URL
      console.debug(
        `Trying OAuth discovery fallback at ${wellKnownUrls.authorizationServer}`,
      );
      const authServerMetadata = await this.fetchAuthorizationServerMetadata(
        wellKnownUrls.authorizationServer,
      );

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

    console.log(
      `Found resource metadata URI from www-authenticate header: ${resourceMetadataUri}`,
    );

    const resourceMetadata =
      await this.fetchProtectedResourceMetadata(resourceMetadataUri);
    if (!resourceMetadata?.authorization_servers?.length) {
      return null;
    }

    const authServerMetadataUrl = this.constructRfc841WellKnownUrl(
      resourceMetadata.authorization_servers[0],
      '/.well-known/oauth-authorization-server',
    );
    const authServerMetadata = await this.fetchAuthorizationServerMetadata(
      authServerMetadataUrl,
    );

    if (authServerMetadata) {
      console.log(
        'OAuth configuration discovered successfully from www-authenticate header',
      );
      return this.metadataToOAuthConfig(authServerMetadata);
    }

    return null;
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
