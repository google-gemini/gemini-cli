/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  afterEach,
  beforeEach,
  type MockInstance,
} from 'vitest';
import * as path from 'node:path';
import { setTargetDir } from './config.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: () => '/home/user',
    debugLogger: {
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('setTargetDir', () => {
  let mockProcessChdir: MockInstance;

  beforeEach(() => {
    mockProcessChdir = vi.spyOn(process, 'chdir').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/original');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['CODER_AGENT_WORKSPACE_PATH'];
  });

  it('should return original CWD if no target dir is set', () => {
    expect(setTargetDir(undefined)).toBe('/tmp/original');
    expect(mockProcessChdir).not.toHaveBeenCalled();
  });

  it('should set target dir from env var', () => {
    process.env['CODER_AGENT_WORKSPACE_PATH'] = '/tmp/target';
    expect(setTargetDir(undefined)).toBe(path.resolve('/tmp/target'));
    expect(mockProcessChdir).toHaveBeenCalledWith(path.resolve('/tmp/target'));
  });

  it('should block sensitive paths', () => {
    const sensitivePaths = ['/', '/etc', '/root', '/var', '/home'];

    for (const p of sensitivePaths) {
      process.env['CODER_AGENT_WORKSPACE_PATH'] = p;
      expect(setTargetDir(undefined)).toBe('/tmp/original');
      expect(mockProcessChdir).not.toHaveBeenCalled();
      // Reset call count for next iteration if it were called (it shouldn't be)
      mockProcessChdir.mockClear();
    }
  });

  it('should block homedir', () => {
    process.env['CODER_AGENT_WORKSPACE_PATH'] = '/home/user';
    expect(setTargetDir(undefined)).toBe('/tmp/original');
    expect(mockProcessChdir).not.toHaveBeenCalled();
  });

  it('should allow non-sensitive paths', () => {
    process.env['CODER_AGENT_WORKSPACE_PATH'] = '/tmp/safe/path';
    expect(setTargetDir(undefined)).toBe(path.resolve('/tmp/safe/path'));
    expect(mockProcessChdir).toHaveBeenCalledWith(
      path.resolve('/tmp/safe/path'),
    );
  });
});
