/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Save original fetch
const originalFetch = global.fetch;

describe('Databricks Endpoint Discovery - Detroit School TDD Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();

    // Mock fetch globally
    global.fetch = vi.fn();

    // Set up environment variables
    process.env.DATABRICKS_URL = 'https://test-workspace.databricks.com';
    process.env.DBX_PAT = 'test-pat-token';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    delete process.env.DATABRICKS_URL;
    delete process.env.DBX_PAT;
  });

  describe('State-Based Tests for Endpoint Discovery', () => {
    // Helper to get fresh module
    async function getFreshModule() {
      vi.resetModules();
      const module = await import('./endpointDiscovery.js');
      return module.discoverDatabricksEndpoints;
    }

    describe('Given: Valid Databricks workspace with serving endpoints', () => {
      describe('When: Fetching endpoints successfully', () => {
        it('Then: Should return array of endpoint names', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          const mockResponse = {
            endpoints: [
              {
                name: 'databricks-claude-sonnet-4',
                id: 'endpoint-1',
                state: { ready: 'READY' },
              },
              {
                name: 'databricks-llama-3-1-70b',
                id: 'endpoint-2',
                state: { ready: 'READY' },
              },
              {
                name: 'databricks-mistral-7b',
                id: 'endpoint-3',
                state: { ready: 'READY' },
              },
            ],
          };

          (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
          });

          const endpoints = await discoverDatabricksEndpoints();

          expect(endpoints).toEqual([
            'databricks-claude-sonnet-4',
            'databricks-llama-3-1-70b',
            'databricks-mistral-7b',
          ]);
        });
      });

      describe('When: Response includes non-ready endpoints', () => {
        it('Then: Should filter out non-ready endpoints', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          const mockResponse = {
            endpoints: [
              {
                name: 'databricks-claude-sonnet-4',
                id: 'endpoint-1',
                state: { ready: 'READY' },
              },
              {
                name: 'databricks-llama-not-ready',
                id: 'endpoint-2',
                state: { ready: 'NOT_READY' },
              },
              {
                name: 'databricks-mistral-7b',
                id: 'endpoint-3',
                state: { ready: 'READY' },
              },
            ],
          };

          (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
          });

          const endpoints = await discoverDatabricksEndpoints();

          expect(endpoints).toEqual([
            'databricks-claude-sonnet-4',
            'databricks-mistral-7b',
          ]);
          expect(endpoints).not.toContain('databricks-llama-not-ready');
        });
      });

      describe('When: Response includes pagination', () => {
        it('Then: Should fetch all pages and return complete list', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          // First page
          const mockPage1 = {
            endpoints: [
              { name: 'model-1', id: '1', state: { ready: 'READY' } },
              { name: 'model-2', id: '2', state: { ready: 'READY' } },
            ],
            next_page_token: 'page-2-token',
          };

          // Second page
          const mockPage2 = {
            endpoints: [
              { name: 'model-3', id: '3', state: { ready: 'READY' } },
              { name: 'model-4', id: '4', state: { ready: 'READY' } },
            ],
          };

          (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
              ok: true,
              json: async () => mockPage1,
            })
            .mockResolvedValueOnce({
              ok: true,
              json: async () => mockPage2,
            });

          const endpoints = await discoverDatabricksEndpoints();

          expect(endpoints).toEqual([
            'model-1',
            'model-2',
            'model-3',
            'model-4',
          ]);

          // Verify pagination was handled
          expect(global.fetch).toHaveBeenCalledTimes(2);
          expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            'https://test-workspace.databricks.com/api/2.0/serving-endpoints?page_token=page-2-token',
            expect.any(Object),
          );
        });
      });
    });

    describe('Given: Authentication credentials', () => {
      describe('When: Using PAT authentication', () => {
        it('Then: Should include proper Authorization header', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ endpoints: [] }),
          });

          await discoverDatabricksEndpoints();

          expect(global.fetch).toHaveBeenCalledWith(
            'https://test-workspace.databricks.com/api/2.0/serving-endpoints',
            {
              headers: {
                Authorization: 'Bearer test-pat-token',
                'Content-Type': 'application/json',
              },
            },
          );
        });
      });

      describe('When: Credentials are missing', () => {
        it('Then: Should throw authentication error', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          delete process.env.DATABRICKS_URL;
          delete process.env.DBX_PAT;

          await expect(discoverDatabricksEndpoints()).rejects.toThrow(
            'Databricks credentials not configured',
          );
        });
      });
    });

    describe('Given: API error responses', () => {
      describe('When: API returns 401 Unauthorized', () => {
        it('Then: Should throw authentication error', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
          });

          await expect(discoverDatabricksEndpoints()).rejects.toThrow(
            'Authentication failed: Invalid PAT token',
          );
        });
      });

      describe('When: API returns 403 Forbidden', () => {
        it('Then: Should throw permission error', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
          });

          await expect(discoverDatabricksEndpoints()).rejects.toThrow(
            'Permission denied: User lacks access to serving endpoints',
          );
        });
      });

      describe('When: API returns 429 Rate Limited', () => {
        it('Then: Should throw rate limit error', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
          });

          await expect(discoverDatabricksEndpoints()).rejects.toThrow(
            'Rate limit exceeded: Please try again later',
          );
        });
      });

      describe('When: Network error occurs', () => {
        it('Then: Should throw network error', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
            new Error('Network error'),
          );

          await expect(discoverDatabricksEndpoints()).rejects.toThrow(
            'Failed to fetch endpoints: Network error',
          );
        });
      });
    });

    describe('Given: Empty or malformed responses', () => {
      describe('When: API returns empty endpoint list', () => {
        it('Then: Should return empty array', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ endpoints: [] }),
          });

          const endpoints = await discoverDatabricksEndpoints();

          expect(endpoints).toEqual([]);
        });
      });

      describe('When: API returns malformed response', () => {
        it('Then: Should throw parsing error', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ invalid: 'response' }),
          });

          await expect(discoverDatabricksEndpoints()).rejects.toThrow(
            'Invalid response format from Databricks API',
          );
        });
      });
    });

    describe('Given: Caching requirements', () => {
      describe('When: Fetching endpoints multiple times within cache window', () => {
        it('Then: Should return cached results without additional API calls', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          const mockResponse = {
            endpoints: [
              { name: 'model-1', id: '1', state: { ready: 'READY' } },
            ],
          };

          (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
          });

          // First call
          const result1 = await discoverDatabricksEndpoints();

          // Second call (should use cache)
          const result2 = await discoverDatabricksEndpoints();

          expect(result1).toEqual(['model-1']);
          expect(result2).toEqual(['model-1']);
          expect(global.fetch).toHaveBeenCalledTimes(1); // Only one API call
        });
      });

      describe('When: Cache expires', () => {
        it('Then: Should fetch fresh data from API', async () => {
          const discoverDatabricksEndpoints = await getFreshModule();
          const mockResponse1 = {
            endpoints: [
              { name: 'model-1', id: '1', state: { ready: 'READY' } },
            ],
          };
          const mockResponse2 = {
            endpoints: [
              { name: 'model-2', id: '2', state: { ready: 'READY' } },
            ],
          };

          (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
              ok: true,
              json: async () => mockResponse1,
            })
            .mockResolvedValueOnce({
              ok: true,
              json: async () => mockResponse2,
            });

          // First call
          const result1 = await discoverDatabricksEndpoints();

          // Force cache expiration
          await discoverDatabricksEndpoints({ forceRefresh: true });

          // Third call should get new data
          const result3 = await discoverDatabricksEndpoints();

          expect(result1).toEqual(['model-1']);
          expect(result3).toEqual(['model-2']);
          expect(global.fetch).toHaveBeenCalledTimes(2);
        });
      });
    });
  });
});
