/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getPackageJson, type PackageJson } from './package.js';
import * as readPackageUpModule from 'read-package-up';

vi.mock('read-package-up');

describe('getPackageJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset the cached packageJson between tests
    vi.resetModules();
  });

  it('should return package.json when found', async () => {
    const mockPackageJson: PackageJson = {
      name: 'test-package',
      version: '1.0.0',
    };

    vi.mocked(readPackageUpModule.readPackageUp).mockResolvedValue({
      packageJson: mockPackageJson,
      path: '/test/package.json',
    } as never);

    const result = await getPackageJson();

    expect(result).toEqual(mockPackageJson);
  });

  it('should return undefined when package.json not found', async () => {
    vi.mocked(readPackageUpModule.readPackageUp).mockResolvedValue(undefined);

    const result = await getPackageJson();

    expect(result).toBeUndefined();
  });

  it('should call readPackageUp with cwd parameter', async () => {
    vi.mocked(readPackageUpModule.readPackageUp).mockResolvedValue(undefined);

    await getPackageJson();

    expect(readPackageUpModule.readPackageUp).toHaveBeenCalledWith({
      cwd: expect.any(String),
    });
  });

  it('should cache package.json after first call', async () => {
    const mockPackageJson: PackageJson = {
      name: 'cached-package',
      version: '2.0.0',
    };

    vi.mocked(readPackageUpModule.readPackageUp).mockResolvedValue({
      packageJson: mockPackageJson,
      path: '/cached/package.json',
    } as never);

    const result1 = await getPackageJson();
    const result2 = await getPackageJson();

    expect(result1).toEqual(mockPackageJson);
    expect(result2).toEqual(mockPackageJson);
    expect(readPackageUpModule.readPackageUp).toHaveBeenCalledTimes(1);
  });

  it('should return same cached instance on subsequent calls', async () => {
    const mockPackageJson: PackageJson = {
      name: 'test',
      version: '1.0.0',
    };

    vi.mocked(readPackageUpModule.readPackageUp).mockResolvedValue({
      packageJson: mockPackageJson,
      path: '/test/package.json',
    } as never);

    const result1 = await getPackageJson();
    const result2 = await getPackageJson();

    expect(result1).toBe(result2);
  });

  it('should handle package.json with config property', async () => {
    const mockPackageJson: PackageJson = {
      name: 'test-package',
      version: '1.0.0',
      config: {
        sandboxImageUri: 'docker://test-image',
      },
    };

    vi.mocked(readPackageUpModule.readPackageUp).mockResolvedValue({
      packageJson: mockPackageJson,
      path: '/test/package.json',
    } as never);

    const result = await getPackageJson();

    expect(result?.config?.sandboxImageUri).toBe('docker://test-image');
  });

  it('should handle package.json without config property', async () => {
    const mockPackageJson: PackageJson = {
      name: 'test-package',
      version: '1.0.0',
    };

    vi.mocked(readPackageUpModule.readPackageUp).mockResolvedValue({
      packageJson: mockPackageJson,
      path: '/test/package.json',
    } as never);

    const result = await getPackageJson();

    expect(result?.config).toBeUndefined();
  });

  it('should handle package.json with all standard fields', async () => {
    const mockPackageJson: PackageJson = {
      name: '@scope/package',
      version: '3.2.1',
      description: 'Test description',
      main: 'index.js',
      scripts: {
        test: 'vitest',
      },
      dependencies: {
        react: '^18.0.0',
      },
    };

    vi.mocked(readPackageUpModule.readPackageUp).mockResolvedValue({
      packageJson: mockPackageJson,
      path: '/test/package.json',
    } as never);

    const result = await getPackageJson();

    expect(result?.name).toBe('@scope/package');
    expect(result?.version).toBe('3.2.1');
    expect(result?.description).toBe('Test description');
  });

  it('should be async function', () => {
    vi.mocked(readPackageUpModule.readPackageUp).mockResolvedValue(undefined);

    const result = getPackageJson();

    expect(result).toBeInstanceOf(Promise);
  });

  it('should handle readPackageUp errors', async () => {
    vi.mocked(readPackageUpModule.readPackageUp).mockRejectedValue(
      new Error('Read error'),
    );

    await expect(getPackageJson()).rejects.toThrow('Read error');
  });

  it('should handle null packageJson in result', async () => {
    vi.mocked(readPackageUpModule.readPackageUp).mockResolvedValue({
      packageJson: null as never,
      path: '/test/package.json',
    } as never);

    const result = await getPackageJson();

    // Should cache null as well
    expect(result).toBeNull();
  });

  it('should use correct cwd path', async () => {
    vi.mocked(readPackageUpModule.readPackageUp).mockResolvedValue(undefined);

    await getPackageJson();

    const callArg = vi.mocked(readPackageUpModule.readPackageUp).mock
      .calls[0][0];
    expect(callArg?.cwd).toBeDefined();
    expect(typeof callArg?.cwd).toBe('string');
  });
});
