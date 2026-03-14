import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import readline from 'readline';
import { runOrchestrator } from '../scripts/orchestrator.ts';
import { runWorker } from '../scripts/worker.ts';

vi.mock('child_process');
vi.mock('fs');
vi.mock('readline');

describe('Offload Tooling Matrix', () => {
  const mockSettings = {
    maintainer: {
      deepReview: {
        remoteHost: 'test-host',
        remoteWorkDir: '~/test-dir',
        terminalType: 'none',
        syncAuth: false,
        geminiSetup: 'preexisting',
        ghSetup: 'preexisting'
      }
    }
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSettings));
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined as any);
    vi.mocked(fs.createWriteStream).mockReturnValue({ pipe: vi.fn() } as any);
    vi.spyOn(process, 'chdir').mockImplementation(() => {});

    vi.mocked(spawnSync).mockImplementation((cmd: any, args: any) => {
      return { status: 0, stdout: Buffer.from('test-meta\n'), stderr: Buffer.from('') } as any;
    });

    vi.mocked(spawn).mockImplementation(() => {
        return {
            stdout: { pipe: vi.fn(), on: vi.fn() },
            stderr: { pipe: vi.fn(), on: vi.fn() },
            on: vi.fn((event, cb) => { if (event === 'close') cb(0); }),
            pid: 1234
        } as any;
    });
  });

  describe('Implement Playbook', () => {
    it('should create a branch and run research/implementation', async () => {
      await runOrchestrator(['456', 'implement'], {});
      
      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const ghCall = spawnCalls.find(call => {
          const cmdStr = JSON.stringify(call);
          return cmdStr.includes('issue') && cmdStr.includes('view') && cmdStr.includes('456');
      });
      expect(ghCall).toBeDefined();

      const sshCall = spawnCalls.find(call => {
          const cmdStr = JSON.stringify(call);
          return cmdStr.includes('implement') && cmdStr.includes('offload-456-impl-456');
      });
      expect(sshCall).toBeDefined();
    });
  });

  describe('Fix Loop', () => {
    it('should iterate until CI passes', async () => {
      let checkAttempts = 0;
      vi.mocked(spawnSync).mockImplementation((cmd: any, args: any) => {
        // Correctly check command AND args
        const isCheck = (typeof cmd === 'string' && cmd.includes('pr checks')) || 
                        (Array.isArray(args) && args.includes('checks'));
        
        if (isCheck) {
          checkAttempts++;
          return { status: 0, stdout: Buffer.from(checkAttempts === 1 ? 'fail' : 'success') } as any;
        }
        return { status: 0, stdout: Buffer.from('test-branch\n') } as any;
      });

      vi.useFakeTimers();
      
      const workerPromise = runWorker(['123', 'test-branch', '/path/policy', 'fix']);
      
      // Multi-stage timer flush to get through TaskRunner cycles and the polling loop
      for(let i=0; i<10; i++) {
          await vi.advanceTimersByTimeAsync(2000);
      }
      
      await vi.advanceTimersByTimeAsync(40000); // 1st fail
      for(let i=0; i<10; i++) { await vi.advanceTimersByTimeAsync(2000); }
      await vi.advanceTimersByTimeAsync(40000); // 2nd pass
      
      await workerPromise;
      expect(checkAttempts).toBe(2);
      vi.useRealTimers();
    });
  });
});
