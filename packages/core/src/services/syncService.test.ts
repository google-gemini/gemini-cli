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

  it('should construct correct gcloud scp command', async () => {
    const mockChild = new EventEmitter() as any;
    vi.mocked(spawn).mockReturnValue(mockChild);

    const promise = service.pushSettings({
      instanceName: 'test-inst',
      zone: 'us-west1-a',
      project: 'test-project',
    });

    setTimeout(() => mockChild.emit('exit', 0), 10);

    await promise;

    expect(spawn).toHaveBeenCalledWith(
      'gcloud',
      [
        'compute',
        'scp',
        '--recurse',
        '/mock/local/dir',
        'test-inst:.gemini',
        '--zone=us-west1-a',
        '--project=test-project',
        '--tunnel-through-iap',
      ],
      expect.any(Object)
    );
  });
});
