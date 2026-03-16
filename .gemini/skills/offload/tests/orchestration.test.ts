import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import readline from 'readline';
import { runOrchestrator } from '../scripts/orchestrator.ts';
import { runSetup } from '../scripts/setup.ts';
import { ProviderFactory } from '../scripts/providers/ProviderFactory.ts';

vi.mock('child_process');
vi.mock('fs');
vi.mock('readline');
vi.mock('../scripts/providers/ProviderFactory.ts');

describe('Offload Orchestration (Refactored)', () => {
  const mockSettings = {
    maintainer: {
      deepReview: {
        projectId: 'test-project',
        zone: 'us-west1-a',
        remoteWorkDir: '/home/node/dev/main'
      }
    }
  };

  const mockProvider = {
    provision: vi.fn().mockResolvedValue(0),
    ensureReady: vi.fn().mockResolvedValue(0),
    setup: vi.fn().mockResolvedValue(0),
    exec: vi.fn().mockResolvedValue(0),
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: '', stderr: '' }),
    sync: vi.fn().mockResolvedValue(0),
    getStatus: vi.fn().mockResolvedValue({ name: 'test-instance', status: 'RUNNING' }),
    stop: vi.fn().mockResolvedValue(0)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSettings));
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined as any);
    
    // Explicitly set the mock return value for each test
    vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);

    vi.mocked(spawnSync).mockImplementation((cmd: any) => {
      if (cmd === 'gh') return { status: 0, stdout: Buffer.from('test-branch\n') } as any;
      return { status: 0, stdout: Buffer.from('') } as any;
    });

    vi.spyOn(process, 'chdir').mockImplementation(() => {});
  });

  describe('orchestrator.ts', () => {
    it('should wake the worker and execute remote commands', async () => {
      await runOrchestrator(['123'], { USER: 'testuser' });
      
      expect(mockProvider.ensureReady).toHaveBeenCalled();
      expect(mockProvider.exec).toHaveBeenCalledWith(expect.stringContaining('git worktree add'), expect.any(Object));
    });
  });

  describe('setup.ts', () => {
    const mockInterface = {
      question: vi.fn(),
      close: vi.fn()
    };

    beforeEach(() => {
      vi.mocked(readline.createInterface).mockReturnValue(mockInterface as any);
    });

    it('should use the provider to configure SSH and sync scripts', async () => {
      mockInterface.question
        .mockImplementationOnce((q, cb) => cb('test-project'))
        .mockImplementationOnce((q, cb) => cb('us-west1-a'))
        .mockImplementationOnce((q, cb) => cb('.internal')) // dnsSuffix
        .mockImplementationOnce((q, cb) => cb('n')) // sync auth
        .mockImplementationOnce((q, cb) => cb('n')) // scoped token
        .mockImplementationOnce((q, cb) => cb('n')); // clone

      // Ensure mockProvider is returned
      vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);

      await runSetup({ USER: 'testuser' });

      expect(mockProvider.setup).toHaveBeenCalled();
    });
  });
});
