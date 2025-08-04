/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface DatabricksEndpoint {
  name: string;
  id: string;
  state: {
    ready: string;
  };
}

interface EndpointsResponse {
  endpoints: DatabricksEndpoint[];
  next_page_token?: string;
}

interface DiscoveryOptions {
  forceRefresh?: boolean;
}

// Simple in-memory cache
let cachedEndpoints: string[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function discoverDatabricksEndpoints(
  options: DiscoveryOptions = {},
): Promise<string[]> {
  // Check credentials
  const databricksUrl = process.env.DATABRICKS_URL;
  const patToken = process.env.DBX_PAT;

  if (!databricksUrl || !patToken) {
    throw new Error('Databricks credentials not configured');
  }

  // Check cache unless force refresh
  if (!options.forceRefresh && cachedEndpoints && cacheTimestamp) {
    const now = Date.now();
    if (now - cacheTimestamp < CACHE_TTL_MS) {
      return cachedEndpoints;
    }
  }

  try {
    const endpoints: DatabricksEndpoint[] = [];
    let pageToken: string | undefined;

    // Fetch all pages
    do {
      const url = pageToken
        ? `${databricksUrl}/api/2.0/serving-endpoints?page_token=${pageToken}`
        : `${databricksUrl}/api/2.0/serving-endpoints`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${patToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed: Invalid PAT token');
        } else if (response.status === 403) {
          throw new Error(
            'Permission denied: User lacks access to serving endpoints',
          );
        } else if (response.status === 429) {
          throw new Error('Rate limit exceeded: Please try again later');
        }
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as EndpointsResponse;

      if (!data.endpoints || !Array.isArray(data.endpoints)) {
        throw new Error('Invalid response format from Databricks API');
      }

      endpoints.push(...data.endpoints);
      pageToken = data.next_page_token;
    } while (pageToken);

    // Filter for ready endpoints and extract names
    const readyEndpoints = endpoints
      .filter((ep) => ep.state?.ready === 'READY')
      .map((ep) => ep.name);

    // Update cache
    cachedEndpoints = readyEndpoints;
    cacheTimestamp = Date.now();

    return readyEndpoints;
  } catch (error) {
    // Log the actual error for debugging
    console.error('[Databricks] Endpoint discovery error:', error);

    if (error instanceof Error && error.message.includes('Network')) {
      throw new Error(`Failed to fetch endpoints: ${error.message}`);
    }
    throw error;
  }
}
