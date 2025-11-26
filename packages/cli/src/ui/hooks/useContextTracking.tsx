/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { tokenLimit, uiTelemetryService } from '@google/gemini-cli-core';

export type ContextZone = 'green' | 'yellow' | 'red';

export interface ContextTrackingState {
  tokenCount: number;
  tokenLimit: number;
  percentage: number;
  zone: ContextZone;
  willCompressAt: number;
}

const DEFAULT_COMPRESSION_THRESHOLD = 0.5; // 50%

/**
 * Hook to track context window usage in real-time.
 * Subscribes to uiTelemetryService for automatic updates when token counts change.
 *
 * @param model - The model name to determine token limits
 */
export function useContextTracking(model: string): ContextTrackingState {
  const [tokenCount, setTokenCount] = useState<number>(0);

  const maxTokens = tokenLimit(model);
  const compressionThreshold = maxTokens * DEFAULT_COMPRESSION_THRESHOLD;

  useEffect(() => {
    // Subscribe to real-time updates from uiTelemetryService
    // This provides automatic updates when token counts change
    const handleUpdate = ({
      lastPromptTokenCount,
    }: {
      lastPromptTokenCount: number;
    }) => {
      // Validate token count - handle edge cases
      if (
        typeof lastPromptTokenCount !== 'number' ||
        isNaN(lastPromptTokenCount) ||
        lastPromptTokenCount < 0
      ) {
        setTokenCount((prev) => (prev === 0 ? prev : 0));
        return;
      }

      // Only update if the value actually changed
      setTokenCount((prev) =>
        prev === lastPromptTokenCount ? prev : lastPromptTokenCount,
      );
    };

    // Subscribe to updates
    uiTelemetryService.on('update', handleUpdate);

    // Set initial state
    const initialCount = uiTelemetryService.getLastPromptTokenCount();
    if (
      typeof initialCount === 'number' &&
      !isNaN(initialCount) &&
      initialCount >= 0
    ) {
      setTokenCount(initialCount);
    }

    // Cleanup on unmount
    return () => {
      uiTelemetryService.off('update', handleUpdate);
    };
  }, []); // No dependencies - subscribe once on mount

  // Calculate percentage (memoized to prevent recalculation on every render)
  const percentage = useMemo(
    () => (maxTokens > 0 ? (tokenCount / maxTokens) * 100 : 0),
    [tokenCount, maxTokens],
  );

  // Determine zone based on percentage (memoized)
  const zone: ContextZone = useMemo(
    () => (percentage >= 75 ? 'red' : percentage >= 50 ? 'yellow' : 'green'),
    [percentage],
  );

  return useMemo(
    () => ({
      tokenCount,
      tokenLimit: maxTokens,
      percentage,
      zone,
      willCompressAt: compressionThreshold,
    }),
    [tokenCount, maxTokens, percentage, zone, compressionThreshold],
  );
}
