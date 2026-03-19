/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SSHService } from './sshService.js';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('SSHService', () => {
  let service: SSHService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SSHService();
  });

  it('should construct correct gcloud command and arguments', async () => {
    const mockChild = new EventEmitter() as any;
    vi.mocked(spawn).mockReturnValue(mockChild);

    const promise = service.connect({
      instanceName: 'test-inst',
      zone: 'us-west1-a',
      project: 'test-project',
      forwardAgent: true,
    });

    // Simulate success exit
    setTimeout(() => mockChild.emit('exit', 0), 10);

    const code = await promise;
    expect(code).toBe(0);

    expect(spawn).toHaveBeenCalledWith(
      'gcloud',
      [
        'compute',
        'ssh',
        'test-inst',
        '--zone=us-west1-a',
        '--project=test-project',
        '--tunnel-through-iap',
        '--ssh-flag=-A',
      ],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('should handle failure exit code', async () => {
    const mockChild = new EventEmitter() as any;
    vi.mocked(spawn).mockReturnValue(mockChild);

    const promise = service.connect({
        instanceName: 'test-inst',
        zone: 'us-west1-a',
        project: 'test-project',
    });

    setTimeout(() => mockChild.emit('exit', 1), 10);

    await expect(promise).rejects.toThrow('gcloud ssh exited with code 1');
  });
});
