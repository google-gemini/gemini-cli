import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import readline from 'readline';
import { runOrchestrator } from '../scripts/orchestrator.ts';
import { runWorker } from '../scripts/worker.ts';
import { ProviderFactory } from '../scripts/providers/ProviderFactory.ts';

vi.mock('child_process');
vi.mock('fs');
vi.mock('readline');
vi.mock('../scripts/providers/ProviderFactory.ts');

describe('Offload Tooling Matrix', () => {
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
    vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);

    vi.mocked(spawnSync).mockImplementation((cmd: any) => {
      if (cmd === 'gh') return { status: 0, stdout: Buffer.from('test-branch\n') } as any;
      return { status: 0, stdout: Buffer.from('') } as any;
    });

    vi.mocked(spawn).mockImplementation(() => {
        return {
            stdout: { pipe: vi.fn(), on: vi.fn() },
            stderr: { pipe: vi.fn(), on: vi.fn() },
            on: vi.fn((event, cb) => { if (event === 'close') cb(0); }),
            pid: 1234
        } as any;
    });

    vi.spyOn(process, 'chdir').mockImplementation(() => {});
  });

  describe('Implement Playbook', () => {
    it('should create a branch and run research/implementation', async () => {
      await runOrchestrator(['456', 'implement'], {});
      
      expect(mockProvider.exec).toHaveBeenCalledWith(expect.stringContaining('git worktree add'), expect.any(Object));
      expect(mockProvider.exec).toHaveBeenCalledWith(expect.stringContaining('tmux new-session'), expect.any(Object));
    });
  });

  describe('Fix Playbook', () => {
    it('should launch the agentic fix-pr skill', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await runWorker(['123', 'test-branch', '/path/policy', 'fix']);
      
      const spawnSyncCalls = vi.mocked(spawnSync).mock.calls;
      const fixCall = spawnSyncCalls.find(call => 
          JSON.stringify(call).includes("activate the 'fix-pr' skill")
      );
      expect(fixCall).toBeDefined();
    });
  });
});
