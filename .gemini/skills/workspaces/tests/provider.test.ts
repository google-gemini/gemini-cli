import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { GceCosProvider } from '../scripts/providers/GceCosProvider.ts';

vi.mock('child_process');
vi.mock('fs');

describe('GceCosProvider', () => {
  const mockConfig = {
    projectId: 'test-project',
    zone: 'us-west1-a',
    instanceName: 'test-instance',
    repoRoot: '/test-root'
  };

  let provider: GceCosProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    provider = new GceCosProvider(mockConfig.projectId, mockConfig.zone, mockConfig.instanceName, mockConfig.repoRoot);
    
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') } as any);
  });

  it('should provision an instance with COS image and startup script', async () => {
    await provider.provision();
    
    const calls = vi.mocked(spawnSync).mock.calls;
    const createCall = calls.find(c => c[1].includes('create'));
    
    expect(createCall).toBeDefined();
    expect(createCall![1]).toContain('cos-stable');
    expect(createCall![1]).toContain('test-instance');
  });

  it('should attempt direct SSH and fallback to IAP on failure', async () => {
    // Fail direct SSH
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 1, stdout: Buffer.from(''), stderr: Buffer.from('fail') } as any) // direct
      .mockReturnValueOnce({ status: 0, stdout: Buffer.from('ok'), stderr: Buffer.from('') } as any);   // IAP

    const result = await provider.exec('echo 1');
    
    expect(result).toBe(0);
    const calls = vi.mocked(spawnSync).mock.calls;
    expect(calls[0][0]).toBe('ssh');
    expect(calls[1][1]).toContain('--tunnel-through-iap');
  });

  it('should sync files with IAP fallback', async () => {
    // Fail direct rsync
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 1 } as any) // direct
      .mockReturnValueOnce({ status: 0 } as any); // IAP

    await provider.sync('./local', '/remote');
    
    const calls = vi.mocked(spawnSync).mock.calls;
    expect(calls[0][0]).toBe('rsync');
    expect(calls[1][1]).toContain('gcloud compute ssh --project test-project --zone us-west1-a --tunnel-through-iap --quiet');
  });
});
