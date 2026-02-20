/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MCPOAuthConfig } from './oauth-provider.js';
import { getErrorMessage } from '../utils/errors.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Error thrown when the discovered resource metadata does not match the expected resource.
 */
export class ResourceMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceMismatchError';
  }
}

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

export const FIVE_MIN_BUFFER_MS = 5 * 60 * 1000;

/**
 * Utility class for common OAuth operations.
 */
export class OAuthUtils {
  /**
   * Construct well-known OAuth endpoint URLs per RFC 9728 §3.1.
   *
   * The well-known URI is constructed by inserting /.well-known/oauth-protected-resource
   * between the host and any existing path component. This preserves the resource's
   * path structure in the metadata URL.
   *
   * Examples:
   * - https://example.com -> https://example.com/.well-known/oauth-protected-resource
   * - https://example.com/api/resource -> https://example.com/.well-known/oauth-protected-resource/api/resource
   *
   * @param baseUrl The resource URL
   * @param useRootDiscovery If true, ignores path and uses root-based discovery (for fallback compatibility)
   */
  static buildWellKnownUrls(baseUrl: string, useRootDiscovery = false) {
    const serverUrl = new URL(baseUrl);
    const base = `${serverUrl.protocol}//${serverUrl.host}`;
    const pathSuffix = useRootDiscovery
      ? ''
      : serverUrl.pathname.replace(/\/$/, ''); // Remove trailing slash

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
      // Disable redirect following to prevent SSRF via open redirects.
      // An attacker could provide a URI that passes origin checks but
      // redirects to internal resources (e.g., 169.254.169.254).
      const response = await fetch(resourceMetadataUrl, {
        redirect: 'error',
      });
      if (!response.ok) {
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return (await response.json()) as OAuthProtectedResourceMetadata;
    } catch (error) {
      debugLogger.debug(
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
      const response = await fetch(authServerMetadataUrl, {
        redirect: 'error',
      });
      if (!response.ok) {
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return (await response.json()) as OAuthAuthorizationServerMetadata;
    } catch (error) {
      debugLogger.debug(
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
      issuer: metadata.issuer,
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

    debugLogger.debug(
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
      // RFC 9728 §3.1: Construct well-known URL by inserting /.well-known/oauth-protected-resource
      // between the host and path. This is the RFC-compliant approach.
      const wellKnownUrls = this.buildWellKnownUrls(serverUrl);
      let resourceMetadata = await this.fetchProtectedResourceMetadata(
        wellKnownUrls.protectedResource,
      );

      // Fallback: If path-based discovery fails and we have a path, try root-based discovery
      // for backwards compatibility with servers that don't implement RFC 9728 path handling
      if (!resourceMetadata) {
        const url = new URL(serverUrl);
        if (url.pathname && url.pathname !== '/') {
          const rootBasedUrls = this.buildWellKnownUrls(serverUrl, true);
          resourceMetadata = await this.fetchProtectedResourceMetadata(
            rootBasedUrls.protectedResource,
          );
        }
      }

      if (resourceMetadata) {
        // RFC 9728 Section 7.3: The client MUST ensure that the resource identifier URL
        // it is using as the prefix for the metadata request exactly matches the value
        // of the resource metadata parameter in the protected resource metadata document.
        const expectedResource = this.buildResourceParameter(serverUrl);
        if (resourceMetadata.resource !== expectedResource) {
          throw new ResourceMismatchError(
            `Protected resource ${resourceMetadata.resource} does not match expected ${expectedResource}`,
          );
        }
      }

      if (resourceMetadata?.authorization_servers?.length) {
        // Use the first authorization server
        const authServerUrl = resourceMetadata.authorization_servers[0];

        // Block private/internal auth server hosts to prevent SSRF
        try {
          const authHost = new URL(authServerUrl).hostname;
          if (this.isPrivateHost(authHost)) {
            return null;
          }
        } catch {
          return null;
        }

        const authServerMetadata =
          await this.discoverAuthorizationServerMetadata(authServerUrl);

        if (authServerMetadata) {
          const config = this.metadataToOAuthConfig(authServerMetadata);
          if (authServerMetadata.registration_endpoint) {
            debugLogger.log(
              'Dynamic client registration is supported at:',
              authServerMetadata.registration_endpoint,
            );
          }
          return config;
        }
      }

      // Fallback: try well-known endpoints at the base URL
      debugLogger.debug(`Trying OAuth discovery fallback at ${serverUrl}`);
      const authServerMetadata =
        await this.discoverAuthorizationServerMetadata(serverUrl);

      if (authServerMetadata) {
        const config = this.metadataToOAuthConfig(authServerMetadata);
        if (authServerMetadata.registration_endpoint) {
          debugLogger.log(
            'Dynamic client registration is supported at:',
            authServerMetadata.registration_endpoint,
          );
        }
        return config;
      }

      return null;
    } catch (error) {
      if (error instanceof ResourceMismatchError) {
        throw error;
      }
      debugLogger.debug(
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
   * @param mcpServerUrl Optional MCP server URL to validate against the resource metadata
   * @returns The discovered OAuth configuration or null if not available
   */
  static async discoverOAuthFromWWWAuthenticate(
    wwwAuthenticate: string,
    mcpServerUrl?: string,
  ): Promise<MCPOAuthConfig | null> {
    const resourceMetadataUri =
      this.parseWWWAuthenticateHeader(wwwAuthenticate);
    if (!resourceMetadataUri) {
      return null;
    }

    // Always block private/internal hosts regardless of whether we have a server URL.
    try {
      const metadataHost = new URL(resourceMetadataUri).hostname;
      if (this.isPrivateHost(metadataHost)) {
        return null;
      }
    } catch {
      return null;
    }

    // Verify the resource_metadata URI has the same origin as the MCP server
    // to prevent SSRF via attacker-controlled WWW-Authenticate headers.
    if (mcpServerUrl) {
      try {
        const metadataOrigin = new URL(resourceMetadataUri).origin;
        const serverOrigin = new URL(mcpServerUrl).origin;
        if (metadataOrigin !== serverOrigin) {
          return null;
        }
      } catch {
        return null;
      }
    }

    const resourceMetadata =
      await this.fetchProtectedResourceMetadata(resourceMetadataUri);

    if (resourceMetadata && mcpServerUrl) {
      // Validate resource parameter per RFC 9728 Section 7.3
      const expectedResource = this.buildResourceParameter(mcpServerUrl);
      if (resourceMetadata.resource !== expectedResource) {
        throw new ResourceMismatchError(
          `Protected resource ${resourceMetadata.resource} does not match expected ${expectedResource}`,
        );
      }
    }

    if (!resourceMetadata?.authorization_servers?.length) {
      return null;
    }

    const authServerUrl = resourceMetadata.authorization_servers[0];

    // Validate that the authorization server URL doesn't point to
    // private/internal networks to prevent SSRF via metadata poisoning.
    try {
      const authServerHost = new URL(authServerUrl).hostname;
      if (this.isPrivateHost(authServerHost)) {
        return null;
      }
    } catch {
      return null;
    }

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
   * Check if a hostname points to a private or reserved network.
   *
   * @param hostname The hostname to check
   * @returns True if the hostname is a private/reserved address
   */
  static isPrivateHost(hostname: string): boolean {
    const lower = hostname.toLowerCase();

    // Loopback
    if (lower === 'localhost' || lower === '::1') {
      return true;
    }

    // IPv6 private ranges
    if (lower.startsWith('[')) {
      const ipv6 = lower.slice(1, -1); // strip brackets
      if (
        ipv6 === '::1' ||
        ipv6.startsWith('fc') ||
        ipv6.startsWith('fd') || // fc00::/7 unique local
        ipv6.startsWith('fe80') // fe80::/10 link-local
      ) {
        return true;
      }
    }

    // IPv4 address checks
    const parts = hostname.split('.').map(Number);
    if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
      if (parts[0] === 127) return true; // 127.0.0.0/8 loopback
      if (parts[0] === 10) return true; // 10.0.0.0/8
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
      if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
      if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 link-local
      if (parts[0] === 0) return true; // 0.0.0.0/8
    }

    return false;
  }

  /**
   * Build a resource parameter for OAuth requests.
   *
   * @param endpointUrl The endpoint URL
   * @returns The resource parameter value
   */
  static buildResourceParameter(endpointUrl: string): string {
    const url = new URL(endpointUrl);
    return `${url.protocol}//${url.host}${url.pathname}`;
  }

  /**
   * Parses a JWT string to extract its expiry time.
   * @param idToken The JWT ID token.
   * @returns The expiry time in **milliseconds**, or undefined if parsing fails.
   */
  static parseTokenExpiry(idToken: string): number | undefined {
    try {
      const payload = JSON.parse(
        Buffer.from(idToken.split('.')[1], 'base64').toString(),
      );

      if (payload && typeof payload.exp === 'number') {
        return payload.exp * 1000; // Convert seconds to milliseconds
      }
    } catch (e) {
      debugLogger.error(
        'Failed to parse ID token for expiry time with error:',
        e,
      );
    }

    // Return undefined if try block fails or 'exp' is missing/invalid
    return undefined;
  }
}
