/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { MCPOAuthConfig } from './oauth-provider.js';
import { getErrorMessage } from '../utils/errors.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  isAddressPrivate,
  isEnterprisePrivateAddress,
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
  allowPrivateNetwork?: boolean;
  expectedOrigin?: string;
  allowRelative?: boolean;
  baseUri?: string;
}

const PRIVATE_NETWORK_REMEDIATION_HINT =
  'Set "oauth.allowPrivateNetwork": true in settings.json for this MCP server if it is on a trusted private network.';

/**
 * Strips trailing forward slashes in a single linear pass without regex backtracking.
 */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47 /* '/' */) {
    end--;
  }
  return end === value.length ? value : value.slice(0, end);
}

/**
 * Compares two OAuth issuer URLs per RFC 8414 / RFC 9207.
 * Normalizes trailing slashes and origins to ensure consistent matching,
 * while rejecting userinfo and preserving query parameters and fragments.
 */
export function areIssuersEqual(issuerA: string, issuerB: string): boolean {
  if (issuerA === issuerB && !issuerA.includes('@')) return true;

  const normalize = (iss: string): string | null => {
    try {
      const u = new URL(iss);

      // RFC 8414 & RFC 9207: Valid OAuth issuers MUST NOT contain userinfo.
      // Discarding or accepting userinfo can enable URL confusion / mix-up attacks
      // (e.g., https://attacker.com@github.com/login/oauth).
      if (u.username || u.password) {
        return null;
      }

      // Normalize trailing slashes on pathname (e.g., "/oauth/" -> "/oauth")
      const normalizedPath = trimTrailingSlashes(u.pathname);

      // Reconstruct canonical URL:
      // - u.protocol and u.host handle lowercasing and default port removal (:443)
      // - normalizedPath handles trailing slash equivalence
      // - u.search and u.hash are preserved so different tenants/queries never collide
      return `${u.protocol}//${u.host}${normalizedPath}${u.search}${u.hash}`;
    } catch {
      // Fallback for non-standard / relative strings
      return trimTrailingSlashes(iss);
    }
  };

  const normA = normalize(issuerA);
  const normB = normalize(issuerB);

  if (normA === null || normB === null) {
    return false;
  }

  return normA === normB;
}

/**
 * Validates and extracts the canonical origin of an OAuth URL, rejecting
 * missing values, unsupported schemes, and embedded userinfo credentials.
 */
export function extractOAuthUrlOrigin(urlStr: string, label: string): string {
  if (typeof urlStr !== 'string' || urlStr.trim().length === 0) {
    throw new OAuthSecurityError(`Missing or empty OAuth ${label} URL.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch (e) {
    throw new OAuthSecurityError(
      `Invalid OAuth ${label} URL "${urlStr}": ${getErrorMessage(e)}`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new OAuthSecurityError(
      `OAuth ${label} URL must not contain userinfo credentials.`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new OAuthSecurityError(
      `Invalid OAuth ${label} protocol "${parsed.protocol}". Only HTTPS (and HTTP for local development) is supported.`,
    );
  }
  return parsed.origin;
}

/**
 * Normalizes an optional endpoint URL from deserialized JSON or configuration:
 * treats undefined, null, and whitespace-only strings as absent (undefined),
 * while rejecting non-string values with OAuthSecurityError.
 */
export function normalizeOptionalEndpointUrl(
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new OAuthSecurityError(
      `Invalid OAuth ${label} URL: expected string, received ${typeof value}.`,
    );
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

  if (parsed.username || parsed.password) {
    throw new OAuthSecurityError(
      'OAuth endpoint URL must not contain userinfo credentials.',
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

  // Non-loopback host: check literal IP or internal hostname suffix
  if (isAddressPrivate(hostname)) {
    const isEnterprisePrivate = isEnterprisePrivateAddress(hostname);
    if (!options?.allowPrivateNetwork || !isEnterprisePrivate) {
      const hint = isEnterprisePrivate
        ? ` ${PRIVATE_NETWORK_REMEDIATION_HINT}`
        : '';
      throw new OAuthSecurityError(
        `OAuth endpoint "${resolvedUrl}" points to private or reserved IP address which is blocked.${hint}`,
      );
    }
    if (isIP(hostname) !== 0) {
      return parsed.toString();
    }
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
        const isEnterprisePrivate = isEnterprisePrivateAddress(addr.address);
        if (!options?.allowPrivateNetwork || !isEnterprisePrivate) {
          const hint = isEnterprisePrivate
            ? ` ${PRIVATE_NETWORK_REMEDIATION_HINT}`
            : '';
          throw new OAuthSecurityError(
            `OAuth endpoint "${resolvedUrl}" resolves to private network address "${addr.address}" which is blocked.${hint}`,
          );
        }
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
  /**
   * RFC 9207 Section 3: Indicates whether the authorization server provides
   * the "iss" parameter in the authorization response. Defaults to false when
   * omitted.
   */
  authorization_response_iss_parameter_supported?: boolean;
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

/** Per-request deadline for OAuth discovery fetches, same as the MCP HEAD probe. */
export const OAUTH_DISCOVERY_TIMEOUT_MS = 5000;

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
    options?: {
      allowLoopback?: boolean;
      expectedOrigin?: string;
      allowPrivateNetwork?: boolean;
    },
  ): Promise<OAuthProtectedResourceMetadata | null> {
    try {
      const validatedUrl = await validateOAuthEndpointUrl(resourceMetadataUrl, {
        allowLoopback: options?.allowLoopback,
        expectedOrigin: options?.expectedOrigin,
        allowPrivateNetwork: options?.allowPrivateNetwork,
      });

      const response = await fetch(validatedUrl, {
        signal: AbortSignal.timeout(OAUTH_DISCOVERY_TIMEOUT_MS),
      });
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
    options?: { allowLoopback?: boolean; allowPrivateNetwork?: boolean },
  ): Promise<OAuthAuthorizationServerMetadata | null> {
    try {
      const validatedUrl = await validateOAuthEndpointUrl(
        authServerMetadataUrl,
        {
          allowLoopback: options?.allowLoopback,
          allowPrivateNetwork: options?.allowPrivateNetwork,
        },
      );

      const response = await fetch(validatedUrl, {
        signal: AbortSignal.timeout(OAUTH_DISCOVERY_TIMEOUT_MS),
      });
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
    const pinnedOrigin = extractOAuthUrlOrigin(metadata.issuer, 'issuer');
    const authOrigin = extractOAuthUrlOrigin(
      metadata.authorization_endpoint,
      'authorization_endpoint',
    );
    if (authOrigin !== pinnedOrigin) {
      throw new OAuthSecurityError(
        `OAuth authorization_endpoint origin "${authOrigin}" does not match issuer origin "${pinnedOrigin}".`,
      );
    }
    const tokenOrigin = extractOAuthUrlOrigin(
      metadata.token_endpoint,
      'token_endpoint',
    );
    if (tokenOrigin !== pinnedOrigin) {
      throw new OAuthSecurityError(
        `OAuth token_endpoint origin "${tokenOrigin}" does not match issuer origin "${pinnedOrigin}".`,
      );
    }
    const registrationEndpoint = normalizeOptionalEndpointUrl(
      metadata.registration_endpoint,
      'registration_endpoint',
    );
    if (registrationEndpoint !== undefined) {
      const registrationOrigin = extractOAuthUrlOrigin(
        registrationEndpoint,
        'registration_endpoint',
      );
      if (registrationOrigin !== pinnedOrigin) {
        throw new OAuthSecurityError(
          `OAuth registration_endpoint origin "${registrationOrigin}" does not match issuer origin "${pinnedOrigin}".`,
        );
      }
    }

    return {
      authorizationUrl: metadata.authorization_endpoint,
      issuer: metadata.issuer,
      tokenUrl: metadata.token_endpoint,
      scopes: metadata.scopes_supported || [],
      registrationUrl: registrationEndpoint,
      // RFC 9207 Section 3: the flag defaults to false when omitted. Discovered
      // configurations therefore always carry an explicit boolean, which lets
      // the callback policy distinguish them from an explicitly configured issuer.
      // Only a literal boolean `true` enables the flag, so loosely typed values
      // returned by some servers (e.g. "false" or "0") are not coerced to true.
      authorizationResponseIssParameterSupported:
        metadata.authorization_response_iss_parameter_supported === true,
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
    options?: { allowLoopback?: boolean; allowPrivateNetwork?: boolean },
  ): Promise<OAuthAuthorizationServerMetadata | null> {
    const validatedBaseUrl = await validateOAuthEndpointUrl(authServerUrl, {
      allowLoopback: options?.allowLoopback,
      allowPrivateNetwork: options?.allowPrivateNetwork,
    });

    const authServerUrlObj = new URL(validatedBaseUrl);
    const base = `${authServerUrlObj.protocol}//${authServerUrlObj.host}`;
    const normalizedPathname = trimTrailingSlashes(authServerUrlObj.pathname);

    const endpointsToTry: string[] = [];

    if (normalizedPathname !== '') {
      // With issuer URLs with path components, query only path-scoped well-known
      // endpoints so a path-scoped issuer check never collides with a root issuer:
      // 1. OAuth 2.0 Authorization Server Metadata with path insertion
      endpointsToTry.push(
        new URL(
          `/.well-known/oauth-authorization-server${normalizedPathname}`,
          base,
        ).toString(),
      );

      // 2. OpenID Connect Discovery 1.0 with path insertion
      endpointsToTry.push(
        new URL(
          `/.well-known/openid-configuration${normalizedPathname}`,
          base,
        ).toString(),
      );

      // 3. OpenID Connect Discovery 1.0 with path appending
      endpointsToTry.push(
        new URL(
          `${normalizedPathname}/.well-known/openid-configuration`,
          base,
        ).toString(),
      );
    } else {
      // With root issuer URLs without path components, try root well-known endpoints:
      // 1. OAuth 2.0 Authorization Server Metadata
      endpointsToTry.push(
        new URL('/.well-known/oauth-authorization-server', base).toString(),
      );

      // 2. OpenID Connect Discovery 1.0
      endpointsToTry.push(
        new URL('/.well-known/openid-configuration', base).toString(),
      );
    }

    for (const endpoint of endpointsToTry) {
      const authServerMetadata = await this.fetchAuthorizationServerMetadata(
        endpoint,
        options,
      );
      if (
        !authServerMetadata ||
        typeof authServerMetadata !== 'object' ||
        Array.isArray(authServerMetadata)
      ) {
        continue;
      }

      const hasAuthEndpoint =
        typeof authServerMetadata.authorization_endpoint === 'string' &&
        authServerMetadata.authorization_endpoint.trim().length > 0;
      const hasTokenEndpoint =
        typeof authServerMetadata.token_endpoint === 'string' &&
        authServerMetadata.token_endpoint.trim().length > 0;
      if (!hasAuthEndpoint && !hasTokenEndpoint) {
        // Non-OAuth 200 payload (e.g., generic SPA/status JSON); continue to the
        // next well-known candidate (such as openid-configuration).
        continue;
      }

      // RFC 8414 Section 3.3 / OIDC Discovery Section 4.3: metadata.issuer MUST
      // be identical to the authorization server URL used for discovery.
      if (
        typeof authServerMetadata.issuer !== 'string' ||
        authServerMetadata.issuer.trim().length === 0 ||
        !areIssuersEqual(authServerMetadata.issuer, validatedBaseUrl)
      ) {
        throw new OAuthSecurityError(
          `Authorization server metadata issuer "${String(authServerMetadata.issuer ?? '')}" does not match expected authorization server URL "${validatedBaseUrl}".`,
        );
      }

      const pinnedOrigin = extractOAuthUrlOrigin(
        authServerMetadata.issuer,
        'issuer',
      );
      const endpointValidationOptions: OAuthUrlValidationOptions = {
        allowLoopback: options?.allowLoopback,
        allowPrivateNetwork: options?.allowPrivateNetwork,
        expectedOrigin: pinnedOrigin,
      };

      if (!hasAuthEndpoint) {
        throw new OAuthSecurityError(
          'Authorization server metadata is missing required authorization_endpoint.',
        );
      }
      await validateOAuthEndpointUrl(
        authServerMetadata.authorization_endpoint,
        endpointValidationOptions,
      );

      if (!hasTokenEndpoint) {
        throw new OAuthSecurityError(
          'Authorization server metadata is missing required token_endpoint.',
        );
      }
      await validateOAuthEndpointUrl(
        authServerMetadata.token_endpoint,
        endpointValidationOptions,
      );

      const registrationEndpoint = normalizeOptionalEndpointUrl(
        authServerMetadata.registration_endpoint,
        'registration_endpoint',
      );
      if (registrationEndpoint !== undefined) {
        await validateOAuthEndpointUrl(
          registrationEndpoint,
          endpointValidationOptions,
        );
      }

      return authServerMetadata;
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
    options?: { allowPrivateNetwork?: boolean },
  ): Promise<MCPOAuthConfig | null> {
    try {
      const allowLoopback = isLoopbackUrl(serverUrl);
      const allowPrivateNetwork = options?.allowPrivateNetwork;
      const expectedOrigin = new URL(serverUrl).origin;

      // RFC 9728 §3.1: Construct well-known URL by inserting /.well-known/oauth-protected-resource
      // between the host and path. This is the RFC-compliant approach.
      const wellKnownUrls = this.buildWellKnownUrls(serverUrl);
      let resourceMetadata = await this.fetchProtectedResourceMetadata(
        wellKnownUrls.protectedResource,
        { allowLoopback, expectedOrigin, allowPrivateNetwork },
      );

      // Fallback: If path-based discovery fails and we have a path, try root-based discovery
      // for backwards compatibility with servers that don't implement RFC 9728 path handling
      if (!resourceMetadata) {
        const url = new URL(serverUrl);
        if (url.pathname && url.pathname !== '/') {
          const rootBasedUrls = this.buildWellKnownUrls(serverUrl, true);
          resourceMetadata = await this.fetchProtectedResourceMetadata(
            rootBasedUrls.protectedResource,
            { allowLoopback, expectedOrigin, allowPrivateNetwork },
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

      const authServerDiscoveryOptions = {
        allowLoopback,
        ...(allowPrivateNetwork !== undefined ? { allowPrivateNetwork } : {}),
      };

      if (resourceMetadata?.authorization_servers?.length) {
        // Use the first authorization server
        const authServerUrl = resourceMetadata.authorization_servers[0];
        const authServerMetadata =
          await this.discoverAuthorizationServerMetadata(
            authServerUrl,
            authServerDiscoveryOptions,
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
      }

      // Fallback: try well-known endpoints at the server URL, then at the origin
      // base URL (MCP 2025-03-26 compatibility when PRM is absent on a subpath)
      debugLogger.debug(`Trying OAuth discovery fallback at ${serverUrl}`);
      let authServerMetadata = await this.discoverAuthorizationServerMetadata(
        serverUrl,
        authServerDiscoveryOptions,
      );
      if (!authServerMetadata) {
        const serverUrlObj = new URL(serverUrl);
        if (trimTrailingSlashes(serverUrlObj.pathname) !== '') {
          const baseUrl = this.extractBaseUrl(serverUrl);
          authServerMetadata = await this.discoverAuthorizationServerMetadata(
            baseUrl,
            authServerDiscoveryOptions,
          );
        }
      }

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
    options?: { allowPrivateNetwork?: boolean },
  ): Promise<MCPOAuthConfig | null> {
    const resourceMetadataUri =
      this.parseWWWAuthenticateHeader(wwwAuthenticate);
    if (!resourceMetadataUri) {
      return null;
    }

    const allowLoopback = mcpServerUrl ? isLoopbackUrl(mcpServerUrl) : false;
    const allowPrivateNetwork = options?.allowPrivateNetwork;
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
        allowPrivateNetwork,
      },
    );

    const resourceMetadata = await this.fetchProtectedResourceMetadata(
      validatedResourceMetadataUrl,
      {
        allowLoopback,
        expectedOrigin,
        allowPrivateNetwork,
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
        ...(allowPrivateNetwork !== undefined ? { allowPrivateNetwork } : {}),
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
