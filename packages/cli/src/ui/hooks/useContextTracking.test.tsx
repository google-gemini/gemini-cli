/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { useContextTracking } from './useContextTracking.js';
import { uiTelemetryService } from '@google/gemini-cli-core';

// Mock uiTelemetryService
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual<
    typeof import('@google/gemini-cli-core')
  >('@google/gemini-cli-core');
  return {
    ...actual,
    uiTelemetryService: {
      on: vi.fn(),
      off: vi.fn(),
      getLastPromptTokenCount: vi.fn().mockReturnValue(0),
      emit: vi.fn(),
    },
  };
});

describe('useContextTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementation
    vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderContextTrackingHook = (model: string = 'gemini-2.0-flash') => {
    let hookResult: ReturnType<typeof useContextTracking>;

    function TestComponent({ model }: { model: string }) {
      hookResult = useContextTracking(model);
      return null;
    }

    const { rerender } = render(<TestComponent model={model} />);

    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: (newProps: { model?: string }) =>
        rerender(<TestComponent model={newProps.model ?? model} />),
    };
  };

  describe('initialization', () => {
    it('should initialize with zero tokens when service has no token count', () => {
      const { result } = renderContextTrackingHook();

      expect(result.current.tokenCount).toBe(0);
      expect(result.current.percentage).toBe(0);
      expect(result.current.zone).toBe('green');
    });

    it('should initialize with correct token limit for gemini-2.0-flash (1M)', () => {
      const { result } = renderContextTrackingHook('gemini-2.0-flash');

      expect(result.current.tokenLimit).toBe(1_048_576);
      expect(result.current.willCompressAt).toBe(524_288); // 50% of 1M
    });

    it('should initialize with correct token limit for gemini-1.5-pro (2M)', () => {
      const { result } = renderContextTrackingHook('gemini-1.5-pro');

      expect(result.current.tokenLimit).toBe(2_097_152);
      expect(result.current.willCompressAt).toBe(1_048_576); // 50% of 2M
    });

    it('should load initial token count from service on mount', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        200_000,
      );

      const { result } = renderContextTrackingHook();

      expect(result.current.tokenCount).toBe(200_000);
    });
  });

  describe('percentage calculation', () => {
    it('should calculate percentage correctly at 0%', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(0);

      const { result } = renderContextTrackingHook();

      expect(result.current.percentage).toBe(0);
    });

    it('should calculate percentage correctly at 50%', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        524_288,
      ); // 50% of 1M

      const { result } = renderContextTrackingHook();

      expect(result.current.percentage).toBeCloseTo(50, 1);
    });

    it('should calculate percentage correctly at 75%', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        786_432,
      ); // 75% of 1M

      const { result } = renderContextTrackingHook();

      expect(result.current.percentage).toBeCloseTo(75, 1);
    });

    it('should calculate percentage correctly at 100%', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        1_048_576,
      ); // 100% of 1M

      const { result } = renderContextTrackingHook();

      expect(result.current.percentage).toBeCloseTo(100, 1);
    });

    it('should handle percentage over 100%', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        1_200_000,
      ); // >100% of 1M

      const { result } = renderContextTrackingHook();

      expect(result.current.percentage).toBeGreaterThan(100);
    });
  });

  describe('zone transitions', () => {
    it('should be in green zone when usage < 50%', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        400_000,
      ); // ~38% of 1M

      const { result } = renderContextTrackingHook();

      expect(result.current.zone).toBe('green');
      expect(result.current.percentage).toBeLessThan(50);
    });

    it('should transition to yellow zone at exactly 50%', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        524_288,
      ); // 50% of 1M

      const { result } = renderContextTrackingHook();

      expect(result.current.zone).toBe('yellow');
      expect(result.current.percentage).toBeCloseTo(50, 1);
    });

    it('should be in yellow zone when 50% <= usage < 75%', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        600_000,
      ); // ~57% of 1M

      const { result } = renderContextTrackingHook();

      expect(result.current.zone).toBe('yellow');
      expect(result.current.percentage).toBeGreaterThanOrEqual(50);
      expect(result.current.percentage).toBeLessThan(75);
    });

    it('should transition to red zone at exactly 75%', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        786_432,
      ); // 75% of 1M

      const { result } = renderContextTrackingHook();

      expect(result.current.zone).toBe('red');
      expect(result.current.percentage).toBeCloseTo(75, 1);
    });

    it('should be in red zone when usage >= 75%', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        900_000,
      ); // ~86% of 1M

      const { result } = renderContextTrackingHook();

      expect(result.current.zone).toBe('red');
      expect(result.current.percentage).toBeGreaterThanOrEqual(75);
    });
  });

  describe('event subscription', () => {
    it('should update token count when update event is emitted', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        100_000,
      );

      const { result } = renderContextTrackingHook();

      expect(result.current.tokenCount).toBe(100_000);

      // Get the update handler that was registered
      const onCall = vi.mocked(uiTelemetryService.on).mock.calls[0];
      const updateHandler = onCall[1];

      // Simulate telemetry service update
      act(() => {
        updateHandler({ lastPromptTokenCount: 250_000 });
      });

      expect(result.current.tokenCount).toBe(250_000);
    });

    it('should clean up event listeners on unmount', () => {
      const removeListenerSpy = vi.spyOn(uiTelemetryService, 'off');

      function TestComponent({ model }: { model: string }) {
        useContextTracking(model);
        return null;
      }

      const { unmount } = render(<TestComponent model="gemini-2.0-flash" />);

      // Unmount the component
      unmount();

      // Verify cleanup was called
      expect(removeListenerSpy).toHaveBeenCalled();
    });
  });

  describe('model changes', () => {
    it('should recalculate percentage when model changes from 1M to 2M', () => {
      // Start with 1M token model at 500K tokens (47.7%)
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        500_000,
      );

      const { result, rerender } =
        renderContextTrackingHook('gemini-2.0-flash');

      expect(result.current.percentage).toBeCloseTo(47.7, 1);
      expect(result.current.zone).toBe('green');

      // Switch to 2M token model - same 500K tokens now only 23.8%
      rerender({ model: 'gemini-1.5-pro' });

      expect(result.current.percentage).toBeCloseTo(23.8, 1);
      expect(result.current.zone).toBe('green');
    });

    it('should recalculate percentage when model changes from 2M to 1M', () => {
      // Start with 2M token model at 1.2M tokens (57%)
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        1_200_000,
      );

      const { result, rerender } = renderContextTrackingHook('gemini-1.5-pro');

      expect(result.current.percentage).toBeCloseTo(57.2, 1);
      expect(result.current.zone).toBe('yellow');

      // Switch to 1M token model - same 1.2M tokens now exceeds 100%
      rerender({ model: 'gemini-2.0-flash' });

      expect(result.current.percentage).toBeGreaterThan(100);
      expect(result.current.zone).toBe('red');
    });

    it('should update compression threshold when model changes', () => {
      const { result, rerender } =
        renderContextTrackingHook('gemini-2.0-flash');

      expect(result.current.willCompressAt).toBe(524_288); // 50% of 1M

      rerender({ model: 'gemini-1.5-pro' });

      expect(result.current.willCompressAt).toBe(1_048_576); // 50% of 2M
    });

    it('should transition zones correctly when model changes', () => {
      // 600K tokens on 1M model = 57% (yellow)
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        600_000,
      );

      const { result, rerender } =
        renderContextTrackingHook('gemini-2.0-flash');

      expect(result.current.zone).toBe('yellow');

      // Same 600K on 2M model = 28% (green)
      rerender({ model: 'gemini-1.5-pro' });

      expect(result.current.zone).toBe('green');
    });
  });

  describe('edge cases', () => {
    it('should handle NaN token count gracefully', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        NaN,
      );

      const { result } = renderContextTrackingHook();

      // Should fallback to 0 or handle gracefully
      expect(result.current.tokenCount).toBe(0);
    });

    it('should handle negative token count gracefully', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        -1000,
      );

      const { result } = renderContextTrackingHook();

      // Should treat as 0 or handle gracefully
      expect(result.current.tokenCount).toBe(0);
      expect(result.current.percentage).toBe(0);
    });

    it('should handle unknown model by using default token limit', () => {
      const { result } = renderContextTrackingHook('unknown-model');

      expect(result.current.tokenLimit).toBe(1_048_576); // Default 1M
    });

    it('should handle rapid event emissions without errors', () => {
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        100_000,
      );

      const { result } = renderContextTrackingHook();

      expect(result.current.tokenCount).toBe(100_000);

      // Get the update handler
      const onCall = vi.mocked(uiTelemetryService.on).mock.calls[0];
      const updateHandler = onCall[1];

      // Emit multiple events rapidly
      act(() => {
        for (let i = 0; i < 10; i++) {
          updateHandler({ lastPromptTokenCount: 100_000 + i * 10_000 });
        }
      });

      // Should reflect the final value
      expect(result.current.tokenCount).toBe(190_000);
    });
  });
});
