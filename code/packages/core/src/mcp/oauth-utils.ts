/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { lookup } from 'node:dns/promises';
import type { MCPOAuthConfig } from './oauth-provider.js';
import { getErrorMessage } from '../utils/errors.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  isAddressPrivate,
  isLoopbackHost,
  sanitizeHostname,
} from '../utils/fetch.js';

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
 * Error thrown when an OAuth endpoint fails SSRF or URL security validation.
 */
export class OAuthSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthSecurityError';
  }
}

/**
 * Checks if a given URL string points to a loopback address.
 */
export function isLoopbackUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    return isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Options for validating OAuth endpoint URLs.
 */
export interface OAuthUrlValidationOptions {
  allowLoopback?: boolean;
  expectedOrigin?: string;
  allowRelative?: boolean;
  baseUri?: string;
}

/**
 * Validates an OAuth endpoint URL against SSRF, scheme, and origin constraints per RFC 9728 Section 7.7.
 */
export async function validateOAuthEndpointUrl(
  urlStr: string,
  options?: OAuthUrlValidationOptions,
): Promise<string> {
  let resolvedUrl = urlStr.trim();
  if (options?.allowRelative && options.baseUri) {
    try {
      resolvedUrl = new URL(resolvedUrl, options.baseUri).toString();
    } catch (e) {
      throw new OAuthSecurityError(
        `Failed to resolve relative OAuth URL "${urlStr}" against base "${options.baseUri}": ${getErrorMessage(e)}`,
      );
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(resolvedUrl);
  } catch (e) {
    throw new OAuthSecurityError(
      `Invalid OAuth endpoint URL "${resolvedUrl}": ${getErrorMessage(e)}`,
    );
  }

  const isHttp = parsed.protocol === 'http:';
  const isHttps = parsed.protocol === 'https:';
  if (!isHttp && !isHttps) {
    throw new OAuthSecurityError(
      `Invalid OAuth endpoint protocol "${parsed.protocol}". Only HTTPS (and HTTP for local development) is supported.`,
    );
  }

  const hostname = sanitizeHostname(parsed.hostname);
  const isLoopback = isLoopbackHost(hostname);

  if (isHttp && (!options?.allowLoopback || !isLoopback)) {
    throw new OAuthSecurityError(
      `Insecure HTTP OAuth endpoint "${resolvedUrl}" is not allowed. OAuth endpoints must use HTTPS unless connecting to localhost.`,
    );
  }

  if (options?.expectedOrigin) {
    let expected: string;
    try {
      expected = new URL(options.expectedOrigin).origin;
    } catch {
      throw new OAuthSecurityError(
        `Invalid expected origin "${options.expectedOrigin}".`,
      );
    }
    if (parsed.origin !== expected) {
      throw new OAuthSecurityError(
        `OAuth endpoint origin "${parsed.origin}" does not match expected origin "${expected}".`,
      );
    }
  }

  if (isLoopback) {
    if (!options?.allowLoopback) {
      throw new OAuthSecurityError(
        `Loopback OAuth endpoint "${resolvedUrl}" is not allowed for remote MCP servers.`,
      );
    }
    return parsed.toString();
  }

  // Non-loopback host: check literal IP
  if (isAddressPrivate(hostname)) {
    throw new OAuthSecurityError(
      `OAuth endpoint "${resolvedUrl}" points to private or reserved IP address which is blocked.`,
    );
  }

  // Asynchronous DNS resolution to prevent DNS rebinding / SSRF
  try {
    const addresses = await lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new OAuthSecurityError(
        `Failed to resolve hostname "${hostname}" for OAuth endpoint "${resolvedUrl}".`,
      );
    }

    for (const addr of addresses) {
      if (isAddressPrivate(addr.address)) {
        throw new OAuthSecurityError(
          `OAuth endpoint "${resolvedUrl}" resolves to private network address "${addr.address}" which is blocked.`,
        );
      }
    }
  } catch (error) {
    if (error instanceof OAuthSecurityError) {
      throw error;
    }
    throw new OAuthSecurityError(
      `DNS lookup failed for OAuth endpoint host "${hostname}": ${getErrorMessage(error)}`,
    );
  }

  return parsed.toString();
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
   * @param options Validation options including loopback allowance and expected origin
   * @returns The protected resource metadata or null if not available
   */
  static async fetchProtectedResourceMetadata(
    resourceMetadataUrl: string,
    options?: { allowLoopback?: boolean; expectedOrigin?: string },
  ): Promise<OAuthProtectedResourceMetadata | null> {
    try {
      const validatedUrl = await validateOAuthEndpointUrl(resourceMetadataUrl, {
        allowLoopback: options?.allowLoopback,
        expectedOrigin: options?.expectedOrigin,
      });

      const response = await fetch(validatedUrl);
      if (!response.ok) {
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return (await response.json()) as OAuthProtectedResourceMetadata;
    } catch (error) {
      if (error instanceof OAuthSecurityError) {
        throw error;
      }
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
   * @param options Validation options including loopback allowance
   * @returns The authorization server metadata or null if not available
   */
  static async fetchAuthorizationServerMetadata(
    authServerMetadataUrl: string,
    options?: { allowLoopback?: boolean },
  ): Promise<OAuthAuthorizationServerMetadata | null> {
    try {
      const validatedUrl = await validateOAuthEndpointUrl(
        authServerMetadataUrl,
        {
          allowLoopback: options?.allowLoopback,
        },
      );

      const response = await fetch(validatedUrl);
      if (!response.ok) {
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return (await response.json()) as OAuthAuthorizationServerMetadata;
    } catch (error) {
      if (error instanceof OAuthSecurityError) {
        throw error;
      }
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
   * @param options Validation options including loopback allowance
   * @returns The authorization server metadata or null if not found
   */
  static async discoverAuthorizationServerMetadata(
    authServerUrl: string,
    options?: { allowLoopback?: boolean },
  ): Promise<OAuthAuthorizationServerMetadata | null> {
    const validatedBaseUrl = await validateOAuthEndpointUrl(authServerUrl, {
      allowLoopback: options?.allowLoopback,
    });

    const authServerUrlObj = new URL(validatedBaseUrl);
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
      const authServerMetadata = await this.fetchAuthorizationServerMetadata(
        endpoint,
        options,
      );
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
      const allowLoopback = isLoopbackUrl(serverUrl);
      const expectedOrigin = new URL(serverUrl).origin;

      // RFC 9728 §3.1: Construct well-known URL by inserting /.well-known/oauth-protected-resource
      // between the host and path. This is the RFC-compliant approach.
      const wellKnownUrls = this.buildWellKnownUrls(serverUrl);
      let resourceMetadata = await this.fetchProtectedResourceMetadata(
        wellKnownUrls.protectedResource,
        { allowLoopback, expectedOrigin },
      );

      // Fallback: If path-based discovery fails and we have a path, try root-based discovery
      // for backwards compatibility with servers that don't implement RFC 9728 path handling
      if (!resourceMetadata) {
        const url = new URL(serverUrl);
        if (url.pathname && url.pathname !== '/') {
          const rootBasedUrls = this.buildWellKnownUrls(serverUrl, true);
          resourceMetadata = await this.fetchProtectedResourceMetadata(
            rootBasedUrls.protectedResource,
            { allowLoopback, expectedOrigin },
          );
        }
      }

      if (resourceMetadata) {
        // RFC 9728 Section 7.3: The client MUST ensure that the resource identifier URL
        // it is using as the prefix for the metadata request exactly matches the value
        // of the resource metadata parameter in the protected resource metadata document.
        const expectedResource = this.buildResourceParameter(serverUrl);
        if (
          !this.isEquivalentResourceIdentifier(
            resourceMetadata.resource,
            expectedResource,
          )
        ) {
          throw new ResourceMismatchError(
            `Protected resource ${resourceMetadata.resource} does not match expected ${expectedResource}`,
          );
        }
      }

      if (resourceMetadata?.authorization_servers?.length) {
        // Use the first authorization server
        const authServerUrl = resourceMetadata.authorization_servers[0];
        const authServerMetadata =
          await this.discoverAuthorizationServerMetadata(authServerUrl, {
            allowLoopback,
          });

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
      const authServerMetadata = await this.discoverAuthorizationServerMetadata(
        serverUrl,
        {
          allowLoopback,
        },
      );

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
      if (
        error instanceof ResourceMismatchError ||
        error instanceof OAuthSecurityError
      ) {
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
    // Parse Bearer realm and resource_metadata (quoted or unquoted token)
    const match = header.match(/resource_metadata=(?:"([^"]+)"|([^\s,]+))/);
    if (match) {
      return match[1] || match[2] || null;
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

    const allowLoopback = mcpServerUrl ? isLoopbackUrl(mcpServerUrl) : false;
    const expectedOrigin = mcpServerUrl
      ? new URL(mcpServerUrl).origin
      : undefined;

    const validatedResourceMetadataUrl = await validateOAuthEndpointUrl(
      resourceMetadataUri,
      {
        allowLoopback,
        expectedOrigin,
        allowRelative: true,
        baseUri: mcpServerUrl,
      },
    );

    const resourceMetadata = await this.fetchProtectedResourceMetadata(
      validatedResourceMetadataUrl,
      {
        allowLoopback,
        expectedOrigin,
      },
    );

    if (resourceMetadata && mcpServerUrl) {
      // Validate resource parameter per RFC 9728 Section 7.3
      const expectedResource = this.buildResourceParameter(mcpServerUrl);
      if (
        !this.isEquivalentResourceIdentifier(
          resourceMetadata.resource,
          expectedResource,
        )
      ) {
        throw new ResourceMismatchError(
          `Protected resource ${resourceMetadata.resource} does not match expected ${expectedResource}`,
        );
      }
    }

    if (!resourceMetadata?.authorization_servers?.length) {
      return null;
    }

    const authServerUrl = resourceMetadata.authorization_servers[0];
    const authServerMetadata = await this.discoverAuthorizationServerMetadata(
      authServerUrl,
      {
        allowLoopback,
      },
    );

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
    return `${url.protocol}//${url.host}${url.pathname}`;
  }

  private static isEquivalentResourceIdentifier(
    discoveredResource: string,
    expectedResource: string,
  ): boolean {
    const normalize = (resource: string): string => {
      try {
        return this.buildResourceParameter(resource);
      } catch {
        return resource;
      }
    };

    return normalize(discoveredResource) === normalize(expectedResource);
  }

  /**
   * Parses a JWT string to extract its expiry time.
   * @param idToken The JWT ID token.
   * @returns The expiry time in **milliseconds**, or undefined if parsing fails.
   */
  static parseTokenExpiry(idToken: string): number | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
