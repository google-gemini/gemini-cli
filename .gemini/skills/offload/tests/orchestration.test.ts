import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import readline from 'readline';
import { runOrchestrator } from '../scripts/orchestrator.ts';
import { runSetup } from '../scripts/setup.ts';
import { runWorker } from '../scripts/worker.ts';

vi.mock('child_process');
vi.mock('fs');
vi.mock('readline');

describe('Offload Orchestration (GCE)', () => {
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
      const callInfo = JSON.stringify({ cmd, args });
      // 1. Mock GCloud Instance List
      if (callInfo.includes('gcloud') && callInfo.includes('instances') && callInfo.includes('list')) {
        return { status: 0, stdout: Buffer.from(JSON.stringify([{ name: 'gcli-offload-test-worker' }])), stderr: Buffer.from('') } as any;
      }
      // 2. Mock GH Metadata Fetching (local or remote)
      if (callInfo.includes('gh') && callInfo.includes('view')) {
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

  describe('orchestrator.ts', () => {
    it('should discover active workers and use gcloud compute ssh', async () => {
      await runOrchestrator(['123'], {});
      
      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const sshCall = spawnCalls.find(call => 
        JSON.stringify(call).includes('gcloud') && JSON.stringify(call).includes('ssh')
      );

      expect(sshCall).toBeDefined();
      expect(JSON.stringify(sshCall)).toContain('gcli-offload-test-worker');
      expect(JSON.stringify(sshCall)).toContain('test-project');
    });

    it('should construct the correct tmux session name', async () => {
      await runOrchestrator(['123'], {});
      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const sshCall = spawnCalls.find(call => JSON.stringify(call).includes('tmux new-session'));
      expect(JSON.stringify(sshCall)).toContain('offload-123-review');
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

    it('should verify project access during setup', async () => {
      vi.mocked(spawnSync).mockImplementation((cmd: any) => {
        if (cmd === 'gcloud') return { status: 0 } as any;
        return { status: 0, stdout: Buffer.from('') } as any;
      });

      mockInterface.question
        .mockImplementationOnce((q, cb) => cb('test-project'))
        .mockImplementationOnce((q, cb) => cb('us-west1-a'))
        .mockImplementationOnce((q, cb) => cb('n2-standard-8'))
        .mockImplementationOnce((q, cb) => cb('y')) // syncAuth
        .mockImplementationOnce((q, cb) => cb('none'));

      await runSetup({ HOME: '/test-home' });

      expect(vi.mocked(spawnSync)).toHaveBeenCalledWith('gcloud', expect.arrayContaining(['projects', 'describe', 'test-project']), expect.any(Object));
    });
  });

  describe('worker.ts (playbooks)', () => {
    it('should launch the review playbook', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await runWorker(['123', 'test-branch', '/test-policy.toml', 'review']);
      const spawnCalls = vi.mocked(spawn).mock.calls;
      expect(spawnCalls.some(c => JSON.stringify(c).includes("activate the 'review-pr' skill"))).toBe(true);
    });
  });
});
