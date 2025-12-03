/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { SystemInfoTool } from './system-info.js';
import type { Config } from '../config/config.js';
import os from 'node:os';

vi.mock('node:os');

describe('SystemInfoTool', () => {
  const mockConfig = {} as Config;

  it('should return system info', async () => {
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.release).mockReturnValue('1.0.0');
    vi.mocked(os.type).mockReturnValue('Linux');
    vi.mocked(os.arch).mockReturnValue('x64');
    vi.mocked(os.cpus).mockReturnValue(new Array(8) as any);
    vi.mocked(os.totalmem).mockReturnValue(16 * 1024 * 1024 * 1024);
    vi.mocked(os.freemem).mockReturnValue(8 * 1024 * 1024 * 1024);
    vi.mocked(os.uptime).mockReturnValue(3600);
    vi.mocked(os.loadavg).mockReturnValue([1, 2, 3]);
    vi.mocked(os.hostname).mockReturnValue('test-host');

    const tool = new SystemInfoTool(mockConfig);
    const invocation = tool.build({});
    const result = await invocation.execute(new AbortController().signal);

    const info = JSON.parse(result.llmContent as string);
    expect(info).toEqual({
      platform: 'linux',
      release: '1.0.0',
      type: 'Linux',
      arch: 'x64',
      cpus: 8,
      totalMemory: '16.00 GB',
      freeMemory: '8.00 GB',
      uptime: '1.00 hours',
      loadavg: [1, 2, 3],
      hostname: 'test-host',
    });
  });
});
