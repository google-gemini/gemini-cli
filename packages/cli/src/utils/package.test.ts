/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const readPackageUp = vi.hoisted(() => vi.fn());
vi.mock('read-package-up', () => ({
  readPackageUp,
}));

describe('getPackageJson', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset module cache to ensure fresh state for each test
    vi.resetModules();
  });

  it('should return null when no package.json is found', async () => {
    readPackageUp.mockResolvedValue(null);
    const { getPackageJson } = await import('./package.js');
    const result = await getPackageJson();
    expect(result).toBeNull();
  });

  it('should return package.json when found', async () => {
    const mockPackageJson = {
      name: 'test-package',
      version: '1.0.0',
      config: {
        sandboxImageUri: 'test-image',
      },
    };
    readPackageUp.mockResolvedValue({
      packageJson: mockPackageJson,
    });
    const { getPackageJson } = await import('./package.js');
    const result = await getPackageJson();
    expect(result).toEqual(mockPackageJson);
  });

  it('should cache the result on subsequent calls', async () => {
    const mockPackageJson = {
      name: 'test-package',
      version: '1.0.0',
    };
    readPackageUp.mockResolvedValue({
      packageJson: mockPackageJson,
    });
    
    const { getPackageJson } = await import('./package.js');
    
    // First call
    const result1 = await getPackageJson();
    expect(result1).toEqual(mockPackageJson);
    expect(readPackageUp).toHaveBeenCalledTimes(1);
    
    // Second call should use cache
    const result2 = await getPackageJson();
    expect(result2).toEqual(mockPackageJson);
    expect(readPackageUp).toHaveBeenCalledTimes(1); // Should not be called again
  });
}); 