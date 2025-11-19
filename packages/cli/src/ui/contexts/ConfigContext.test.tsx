/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type React from 'react';
import type { Config } from '@google/gemini-cli-core';
import { ConfigContext, useConfig } from './ConfigContext.js';

describe('ConfigContext', () => {
  describe('context creation', () => {
    it('should create context with undefined default value', () => {
      expect(ConfigContext).toBeDefined();
    });

    it('should have Provider component', () => {
      expect(ConfigContext.Provider).toBeDefined();
    });

    it('should have Consumer component', () => {
      expect(ConfigContext.Consumer).toBeDefined();
    });
  });

  describe('useConfig', () => {
    it('should throw error when used outside provider', () => {
      expect(() => {
        renderHook(() => useConfig());
      }).toThrow('useConfig must be used within a ConfigProvider');
    });

    it('should return config when used within provider', () => {
      const mockConfig: Config = {
        apiKey: 'test-key',
        model: 'gemini-pro',
      } as Config;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConfigContext.Provider value={mockConfig}>
          {children}
        </ConfigContext.Provider>
      );

      const { result } = renderHook(() => useConfig(), { wrapper });

      expect(result.current).toEqual(mockConfig);
    });

    it('should provide apiKey from config', () => {
      const mockConfig: Config = {
        apiKey: 'my-api-key',
        model: 'gemini-pro',
      } as Config;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConfigContext.Provider value={mockConfig}>
          {children}
        </ConfigContext.Provider>
      );

      const { result } = renderHook(() => useConfig(), { wrapper });

      expect(result.current.apiKey).toBe('my-api-key');
    });

    it('should provide model from config', () => {
      const mockConfig: Config = {
        apiKey: 'test',
        model: 'gemini-1.5-pro',
      } as Config;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConfigContext.Provider value={mockConfig}>
          {children}
        </ConfigContext.Provider>
      );

      const { result } = renderHook(() => useConfig(), { wrapper });

      expect(result.current.model).toBe('gemini-1.5-pro');
    });

    it('should throw with correct error message', () => {
      const { result } = renderHook(() => {
        try {
          return useConfig();
        } catch (error) {
          return error;
        }
      });

      expect(result.current).toBeInstanceOf(Error);
      expect((result.current as Error).message).toContain('ConfigProvider');
    });

    it('should return same config reference', () => {
      const mockConfig: Config = {
        apiKey: 'test',
        model: 'gemini-pro',
      } as Config;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConfigContext.Provider value={mockConfig}>
          {children}
        </ConfigContext.Provider>
      );

      const { result } = renderHook(() => useConfig(), { wrapper });

      expect(result.current).toBe(mockConfig);
    });

    it('should work with complete config object', () => {
      const mockConfig: Config = {
        apiKey: 'complete-key',
        model: 'gemini-2.0',
        temperature: 0.7,
        maxOutputTokens: 1000,
      } as Config;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConfigContext.Provider value={mockConfig}>
          {children}
        </ConfigContext.Provider>
      );

      const { result } = renderHook(() => useConfig(), { wrapper });

      expect(result.current).toMatchObject({
        apiKey: 'complete-key',
        model: 'gemini-2.0',
      });
    });
  });
});
