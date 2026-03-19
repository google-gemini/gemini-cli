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
      { stdio: 'inherit' }
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

  it('should construct correct gcloud command for pushSecret', async () => {
    const mockChild = new EventEmitter() as any;
    vi.mocked(spawn).mockReturnValue(mockChild);

    const secretValue = 'secret-val';
    const promise = service.pushSecret(
      { instanceName: 'test-inst', zone: 'z1', project: 'p1' },
      '.gh_token',
      secretValue
    );

    setTimeout(() => mockChild.emit('exit', 0), 10);

    await promise;

    expect(spawn).toHaveBeenCalledWith(
      'gcloud',
      [
        'compute',
        'ssh',
        'test-inst',
        '--zone=z1',
        '--project=p1',
        '--tunnel-through-iap',
        '--command',
        `cat << 'EOF' > /dev/shm/.gh_token\n${secretValue}\nEOF\nchmod 600 /dev/shm/.gh_token`,
      ]
    );
  });
});
