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
        projectId: 'test-project',
        zone: 'us-west1-a',
        terminalType: 'none',
        syncAuth: false,
        geminiSetup: 'isolated',
        ghSetup: 'isolated'
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
      const callStr = JSON.stringify({ cmd, args });
      
      // 1. Mock GCloud Instance List
      if (callStr.includes('gcloud') && callStr.includes('instances') && callStr.includes('list')) {
        return { status: 0, stdout: Buffer.from(JSON.stringify([{ name: 'gcli-offload-test-worker' }])), stderr: Buffer.from('') } as any;
      }
      
      // 2. Mock GH Metadata Fetching (local or remote)
      if (callStr.includes('gh') && callStr.includes('view')) {
          return { status: 0, stdout: Buffer.from('test-meta\n'), stderr: Buffer.from('') } as any;
      }
      
      return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') } as any;
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
          const s = JSON.stringify(call);
          return s.includes('gh') && s.includes('issue') && s.includes('view') && s.includes('456');
      });
      expect(ghCall).toBeDefined();

      const sshCall = spawnCalls.find(call => {
          const s = JSON.stringify(call);
          return s.includes('gcloud') && s.includes('ssh') && s.includes('offload-456-implement');
      });
      expect(sshCall).toBeDefined();
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
