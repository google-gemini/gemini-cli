/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type React from 'react';
import { StreamingContext, useStreamingContext } from './StreamingContext.js';

describe('StreamingContext', () => {
  describe('context creation', () => {
    it('should create context with undefined default value', () => {
      expect(StreamingContext).toBeDefined();
    });

    it('should have Provider component', () => {
      expect(StreamingContext.Provider).toBeDefined();
    });

    it('should have Consumer component', () => {
      expect(StreamingContext.Consumer).toBeDefined();
    });
  });

  describe('useStreamingContext', () => {
    it('should throw error when used outside provider', () => {
      expect(() => {
        renderHook(() => useStreamingContext());
      }).toThrow(
        'useStreamingContext must be used within a StreamingContextProvider',
      );
    });

    it('should return context value when used within provider', () => {
      const mockStreamingState = {
        isStreaming: true,
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <StreamingContext.Provider value={mockStreamingState}>
          {children}
        </StreamingContext.Provider>
      );

      const { result } = renderHook(() => useStreamingContext(), { wrapper });

      expect(result.current).toEqual(mockStreamingState);
    });

    it('should provide isStreaming true value', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <StreamingContext.Provider value={{ isStreaming: true }}>
          {children}
        </StreamingContext.Provider>
      );

      const { result } = renderHook(() => useStreamingContext(), { wrapper });

      expect(result.current.isStreaming).toBe(true);
    });

    it('should provide isStreaming false value', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <StreamingContext.Provider value={{ isStreaming: false }}>
          {children}
        </StreamingContext.Provider>
      );

      const { result } = renderHook(() => useStreamingContext(), { wrapper });

      expect(result.current.isStreaming).toBe(false);
    });

    it('should throw with correct error message', () => {
      const { result } = renderHook(() => {
        try {
          return useStreamingContext();
        } catch (error) {
          return error;
        }
      });

      expect(result.current).toBeInstanceOf(Error);
      expect((result.current as Error).message).toContain(
        'StreamingContextProvider',
      );
    });

    it('should return same context reference', () => {
      const mockValue = { isStreaming: true };
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <StreamingContext.Provider value={mockValue}>
          {children}
        </StreamingContext.Provider>
      );

      const { result } = renderHook(() => useStreamingContext(), { wrapper });

      expect(result.current).toBe(mockValue);
    });
  });
});
