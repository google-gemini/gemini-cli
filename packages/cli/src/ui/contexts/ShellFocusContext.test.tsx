/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type React from 'react';
import { ShellFocusContext, useShellFocusState } from './ShellFocusContext.js';

describe('ShellFocusContext', () => {
  describe('context creation', () => {
    it('should create context with true default value', () => {
      expect(ShellFocusContext).toBeDefined();
    });

    it('should have Provider component', () => {
      expect(ShellFocusContext.Provider).toBeDefined();
    });

    it('should have Consumer component', () => {
      expect(ShellFocusContext.Consumer).toBeDefined();
    });
  });

  describe('useShellFocusState', () => {
    it('should return default value of true when no provider', () => {
      const { result } = renderHook(() => useShellFocusState());
      expect(result.current).toBe(true);
    });

    it('should return true when provider value is true', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ShellFocusContext.Provider value={true}>
          {children}
        </ShellFocusContext.Provider>
      );

      const { result } = renderHook(() => useShellFocusState(), { wrapper });
      expect(result.current).toBe(true);
    });

    it('should return false when provider value is false', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ShellFocusContext.Provider value={false}>
          {children}
        </ShellFocusContext.Provider>
      );

      const { result } = renderHook(() => useShellFocusState(), { wrapper });
      expect(result.current).toBe(false);
    });

    it('should work with nested providers', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ShellFocusContext.Provider value={false}>
          <ShellFocusContext.Provider value={true}>
            {children}
          </ShellFocusContext.Provider>
        </ShellFocusContext.Provider>
      );

      const { result } = renderHook(() => useShellFocusState(), { wrapper });
      expect(result.current).toBe(true);
    });

    it('should return boolean type', () => {
      const { result } = renderHook(() => useShellFocusState());
      expect(typeof result.current).toBe('boolean');
    });

    it('should use context value consistently', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ShellFocusContext.Provider value={false}>
          {children}
        </ShellFocusContext.Provider>
      );

      const { result: result1 } = renderHook(() => useShellFocusState(), {
        wrapper,
      });
      const { result: result2 } = renderHook(() => useShellFocusState(), {
        wrapper,
      });

      expect(result1.current).toBe(result2.current);
    });
  });
});
