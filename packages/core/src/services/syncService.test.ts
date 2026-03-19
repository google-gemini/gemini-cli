/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from './syncService.js';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../config/storage.js', () => ({
  Storage: {
    getGlobalGeminiDir: vi.fn().mockReturnValue('/mock/local/dir'),
  },
}));

describe('SyncService', () => {
  let service: SyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SyncService();
  });

  it('should construct correct gcloud scp command for each essential item', async () => {
    // We need to simulate multiple successful exits for the multiple spawn calls
    vi.mocked(spawn).mockImplementation(() => {
        const child = new EventEmitter() as any;
        // Emit exit on next tick to ensure promise resolves correctly
        process.nextTick(() => child.emit('exit', 0));
        return child;
    });

    await service.pushSettings({
      instanceName: 'test-inst',
      zone: 'us-west1-a',
      project: 'test-project',
    });

    // Check first call (settings.json)
    expect(spawn).toHaveBeenCalledWith(
      'gcloud',
      [
        'compute',
        'scp',
        '--recurse',
        '/mock/local/dir/settings.json',
        'test-inst:.gemini/',
        '--zone=us-west1-a',
        '--project=test-project',
        '--tunnel-through-iap',
      ],
      expect.any(Object)
    );

    // Check total number of calls matches the essentials list
    expect(spawn).toHaveBeenCalledTimes(5); 
  });
});
