/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PerformanceService } from '../../services/performance-service.js';
import { type PerformanceData, getVersion } from '@google/gemini-cli-core';

export function usePerformanceData(
  live: boolean = false,
  intervalMs: number = 2000,
) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    // Prevent concurrent fetches
    if (fetchingRef.current) return;

    try {
      fetchingRef.current = true;
      setLoading(true);

      // Ensure service is initialized
      await PerformanceService.ensureInitialized?.();

      const currentMetrics = await PerformanceService.getCurrentMetrics();

      // Only update if component is still mounted
      if (mountedRef.current) {
        // If no current data, try to load historical
        if (
          !currentMetrics ||
          Object.keys(currentMetrics.tools.stats).length === 0
        ) {
          const recentMetricsList =
            await PerformanceService.loadRecentMetrics();
          if (recentMetricsList.length > 0) {
            setData(recentMetricsList[0]);
          } else {
            // Create empty but valid structure
            setData({
              timestamp: Date.now(),
              version: await getVersion(),
              startup: { total: 0, phases: [], suggestions: [] },
              memory: {
                current: process.memoryUsage(),
                trend: { direction: 'stable', ratePerMinute: 0 },
                stats: { min: 0, max: 0, avg: 0, count: 0 },
              },
              tools: { stats: {}, frequent: [], slow: [] },
              model: {
                stats: {},
                recentCalls: [],
                tokenUsage: { total: 0, byModel: {} },
              },
              session: {
                current: {
                  sessionId: 'current',
                  duration: 0,
                  tokens: { prompt: 0, completion: 0, total: 0 },
                  toolsCalled: [],
                  filesModified: 0,
                  apiCalls: 0,
                  errors: 0,
                  commands: [],
                },
                historical: [],
                summary: {
                  totalSessions: 0,
                  totalTokens: 0,
                  totalToolsCalled: 0,
                  totalFilesModified: 0,
                  avgSessionDuration: 0,
                  avgTokensPerSession: 0,
                },
              },
            });
          }
        } else {
          setData(currentMetrics);
        }

        setLastUpdated(new Date());
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to fetch performance data',
        );
        // eslint-disable-next-line no-console
        console.error('Performance data fetch error:', err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      fetchingRef.current = false;
    }
  }, []); // Empty deps - function is stable

  useEffect(() => {
    mountedRef.current = true;

    void fetchData();

    let interval: NodeJS.Timeout | undefined;

    if (live) {
      interval = setInterval(() => {
        void fetchData();
      }, intervalMs);
    }

    return () => {
      mountedRef.current = false;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [live, intervalMs, fetchData]);

  return { data, loading, error, lastUpdated, refetch: fetchData };
}
