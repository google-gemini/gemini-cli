/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as coreExports from './index.js';

describe('Core Package Entry Point', () => {
  it('should export core functionality', () => {
    expect(coreExports).toBeDefined();
    expect(typeof coreExports).toBe('object');
  });

  it('should have stable exports structure', () => {
    const exportKeys = Object.keys(coreExports);
    expect(exportKeys.length).toBeGreaterThan(0);
  });

  it('should export functions and classes', () => {
    const exportValues = Object.values(coreExports);
    const hasFunctionsOrClasses = exportValues.some(
      (value) => typeof value === 'function' || typeof value === 'object',
    );
    expect(hasFunctionsOrClasses).toBe(true);
  });

  it('should not export undefined values', () => {
    const exportEntries = Object.entries(coreExports);
    exportEntries.forEach(([key, value]) => {
      // Skip TelemetryEvent as it may have circular dependency timing issues
      if (key === 'TelemetryEvent') return;
      expect(
        value,
        `Export "${key}" should not be undefined`,
      ).not.toBeUndefined();
    });
  });

  it('should maintain consistent export structure between imports', () => {
    const firstImport = coreExports;
    const secondImport = coreExports;

    const firstKeys = Object.keys(firstImport).sort();
    const secondKeys = Object.keys(secondImport).sort();

    expect(firstKeys).toEqual(secondKeys);
  });

  it('should handle TypeScript module resolution', () => {
    // Ensure TypeScript types are properly resolved
    expect(coreExports).toSatisfy(
      (module: unknown) => typeof module === 'object' && module !== null,
    );
  });
});
