/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { getNodeVersionWarning } from './nodeVersionWarning.js';

vi.mock('os', () => ({
  default: { homedir: vi.fn() },
  homedir: vi.fn(),
}));

function setNodeVersion(version: string) {
  Object.defineProperty(process.versions, 'node', {
    value: version,
    configurable: true,
  });
}

describe('getNodeVersionWarning', () => {
  const originalNodeVersion = process.versions.node;

  afterEach(() => {
    setNodeVersion(originalNodeVersion);
  });

  it('should return a warning if Node.js version is less than minMajor', () => {
    setNodeVersion('18.17.0');
    const warnings = getNodeVersionWarning(20);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Node.js v18.17.0');
    expect(warnings[0]).toContain('requires Node.js 20 or higher');
  });

  it('should not return a warning if Node.js version is equal to minMajor', () => {
    setNodeVersion('20.0.0');
    const warnings = getNodeVersionWarning(20);
    expect(warnings).toEqual([]);
  });

  it('should not return a warning if Node.js version is greater than minMajor', () => {
    setNodeVersion('22.1.0');
    const warnings = getNodeVersionWarning(20);
    expect(warnings).toEqual([]);
  });

  it('should use default minMajor=20 if not provided', () => {
    setNodeVersion('18.0.0');
    const warnings = getNodeVersionWarning();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Node.js v18.0.0');
    expect(warnings[0]).toContain('requires Node.js 20 or higher');
  });
});
