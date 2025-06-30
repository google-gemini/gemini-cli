/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';

vi.mock('fs/promises');

const mockFs = vi.mocked(fs);

describe('Version Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return current version from package.json', async () => {
    const mockPackageJson = JSON.stringify({
      name: 'gemini-cli',
      version: '1.2.3',
      description: 'CLI for Google Gemini AI'
    });
    
    mockFs.readFile.mockResolvedValue(mockPackageJson);
    
    const { getVersion } = await import('./version');
    const version = await getVersion();
    
    expect(version).toBe('1.2.3');
  });

  it('should handle missing package.json', async () => {
    mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const { getVersion } = await import('./version');
    const version = await getVersion();
    
    expect(version).toBe('unknown');
  });

  it('should handle invalid JSON in package.json', async () => {
    mockFs.readFile.mockResolvedValue('{ invalid json }');

    const { getVersion } = await import('./version');
    const version = await getVersion();
    
    expect(version).toBe('unknown');
  });

  it('should validate version format', async () => {
    const { isValidVersion } = await import('./version');
    
    expect(isValidVersion('1.0.0')).toBe(true);
    expect(isValidVersion('1.0.0-beta')).toBe(true);
    expect(isValidVersion('1.0.0-alpha.1')).toBe(true);
    expect(isValidVersion('10.20.30')).toBe(true);
    expect(isValidVersion('invalid')).toBe(false);
    expect(isValidVersion('1.0')).toBe(false);
    expect(isValidVersion('')).toBe(false);
  });

  it('should get build information', async () => {
    const { getBuildInfo } = await import('./version');
    const buildInfo = getBuildInfo();
    
    expect(buildInfo).toMatchObject({
      date: expect.any(String),
      commit: expect.any(String),
      branch: expect.any(String)
    });
  });

  it('should format version display string', async () => {
    const { formatVersionDisplay } = await import('./version');
    
    const display = formatVersionDisplay('1.2.3', {
      date: '2025-01-01',
      commit: 'abc123',
      branch: 'main'
    });
    
    expect(display).toContain('1.2.3');
    expect(display).toContain('abc123');
  });

  it('should compare versions correctly', async () => {
    const { compareVersions } = await import('./version');
    
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  });
});