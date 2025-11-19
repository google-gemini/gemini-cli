/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type React from 'react';
import type { AppState } from './AppContext.js';
import { AppContext, useAppContext } from './AppContext.js';

describe('AppContext', () => {
  describe('context creation', () => {
    it('should create context with null default value', () => {
      expect(AppContext).toBeDefined();
    });

    it('should have Provider component', () => {
      expect(AppContext.Provider).toBeDefined();
    });

    it('should have Consumer component', () => {
      expect(AppContext.Consumer).toBeDefined();
    });
  });

  describe('useAppContext', () => {
    it('should throw error when used outside provider', () => {
      expect(() => {
        renderHook(() => useAppContext());
      }).toThrow('useAppContext must be used within an AppProvider');
    });

    it('should return app state when used within provider', () => {
      const mockAppState: AppState = {
        version: '1.0.0',
        startupWarnings: [],
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AppContext.Provider value={mockAppState}>
          {children}
        </AppContext.Provider>
      );

      const { result } = renderHook(() => useAppContext(), { wrapper });

      expect(result.current).toEqual(mockAppState);
    });

    it('should provide version from app state', () => {
      const mockAppState: AppState = {
        version: '2.5.1',
        startupWarnings: [],
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AppContext.Provider value={mockAppState}>
          {children}
        </AppContext.Provider>
      );

      const { result } = renderHook(() => useAppContext(), { wrapper });

      expect(result.current.version).toBe('2.5.1');
    });

    it('should provide empty startupWarnings array', () => {
      const mockAppState: AppState = {
        version: '1.0.0',
        startupWarnings: [],
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AppContext.Provider value={mockAppState}>
          {children}
        </AppContext.Provider>
      );

      const { result } = renderHook(() => useAppContext(), { wrapper });

      expect(result.current.startupWarnings).toEqual([]);
    });

    it('should provide startup warnings when present', () => {
      const warnings = ['Warning 1', 'Warning 2'];
      const mockAppState: AppState = {
        version: '1.0.0',
        startupWarnings: warnings,
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AppContext.Provider value={mockAppState}>
          {children}
        </AppContext.Provider>
      );

      const { result } = renderHook(() => useAppContext(), { wrapper });

      expect(result.current.startupWarnings).toEqual(warnings);
      expect(result.current.startupWarnings).toHaveLength(2);
    });

    it('should throw with correct error message', () => {
      const { result } = renderHook(() => {
        try {
          return useAppContext();
        } catch (error) {
          return error;
        }
      });

      expect(result.current).toBeInstanceOf(Error);
      expect((result.current as Error).message).toContain('AppProvider');
    });

    it('should return same app state reference', () => {
      const mockAppState: AppState = {
        version: '1.0.0',
        startupWarnings: [],
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AppContext.Provider value={mockAppState}>
          {children}
        </AppContext.Provider>
      );

      const { result } = renderHook(() => useAppContext(), { wrapper });

      expect(result.current).toBe(mockAppState);
    });

    it('should handle multiple startup warnings', () => {
      const warnings = [
        'Deprecated API usage',
        'Missing configuration',
        'Network timeout',
      ];
      const mockAppState: AppState = {
        version: '3.0.0',
        startupWarnings: warnings,
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AppContext.Provider value={mockAppState}>
          {children}
        </AppContext.Provider>
      );

      const { result } = renderHook(() => useAppContext(), { wrapper });

      expect(result.current.startupWarnings).toHaveLength(3);
      expect(result.current.startupWarnings[0]).toBe('Deprecated API usage');
    });

    it('should work with semantic version format', () => {
      const mockAppState: AppState = {
        version: '1.2.3-beta.4',
        startupWarnings: [],
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AppContext.Provider value={mockAppState}>
          {children}
        </AppContext.Provider>
      );

      const { result } = renderHook(() => useAppContext(), { wrapper });

      expect(result.current.version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });
});
