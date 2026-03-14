import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import readline from 'readline';
import { runOrchestrator } from '../scripts/orchestrator.ts';
import { runSetup } from '../scripts/setup.ts';
import { runWorker } from '../scripts/worker.ts';
import { runChecker } from '../scripts/check.ts';
import { runCleanup } from '../scripts/clean.ts';

vi.mock('child_process');
vi.mock('fs');
vi.mock('readline');

describe('Offload Orchestration', () => {
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
    
    // Mock settings file existence and content
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSettings));
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined as any);
    vi.mocked(fs.createWriteStream).mockReturnValue({ pipe: vi.fn() } as any);

    // Mock process methods
    vi.spyOn(process, 'chdir').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue('/test-cwd');
    
    // Default mock for spawnSync
    vi.mocked(spawnSync).mockImplementation((cmd: any, args: any) => {
      if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'view') {
        return { status: 0, stdout: Buffer.from('test-branch\n'), stderr: Buffer.from('') } as any;
      }
      return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') } as any;
    });

    // Default mock for spawn
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
    it('should default to review action and pass it to remote', async () => {
      await runOrchestrator(['123'], {});
      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const sshCall = spawnCalls.find(call => typeof call[0] === 'string' && call[0].includes('entrypoint.ts 123'));
      expect(sshCall![0]).toContain('review');
    });

    it('should pass explicit actions (like fix) to remote', async () => {
      await runOrchestrator(['123', 'fix'], {});
      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const sshCall = spawnCalls.find(call => typeof call[0] === 'string' && call[0].includes('entrypoint.ts 123'));
      expect(sshCall![0]).toContain('fix');
    });

    it('should construct the correct tmux session name from branch', async () => {
      await runOrchestrator(['123'], {});
      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const sshCall = spawnCalls.find(call => typeof call[0] === 'string' && call[0].includes('tmux new-session'));
      // Match the new 'offload-123-test-branch' format
      expect(sshCall![0]).toContain('offload-123-test-branch');
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

    it('should correctly detect pre-existing setup', async () => {
      vi.mocked(spawnSync).mockImplementation((cmd: any, args: any) => {
        if (cmd === 'ssh') {
          const remoteCmd = args[1];
          if (remoteCmd.includes('[ -d ~/test-dir/.git ]')) return { status: 0 } as any;
          if (remoteCmd.includes('command -v')) return { status: 0 } as any;
        }
        return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') } as any;
      });

      mockInterface.question
        .mockImplementationOnce((q, cb) => cb('test-host'))
        .mockImplementationOnce((q, cb) => cb('~/test-dir'))
        .mockImplementationOnce((q, cb) => cb('p'))
        .mockImplementationOnce((q, cb) => cb('p'))
        .mockImplementationOnce((q, cb) => cb('none'));

      await runSetup({ HOME: '/test-home' });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(call => call[0].toString().includes('.gemini/settings.json'));
      expect(writeCall).toBeDefined();
    });
  });

  describe('worker.ts (playbooks)', () => {
    it('should launch the review playbook by default', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await runWorker(['123', 'test-branch', '/test-policy.toml', 'review']);
      const spawnCalls = vi.mocked(spawn).mock.calls;
      expect(spawnCalls.some(c => c[0].includes('/review-frontend'))).toBe(true);
    });

    it('should launch the fix playbook when requested', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await runWorker(['123', 'test-branch', '/test-policy.toml', 'fix']);
      const spawnCalls = vi.mocked(spawn).mock.calls;
      // Match the updated prompt string in fix.ts
      expect(spawnCalls.some(c => c[0].toLowerCase().includes('analyze current failures'))).toBe(true);
    });
  });

  describe('check.ts', () => {
    it('should report SUCCESS when exit files contain 0', async () => {
      vi.mocked(spawnSync).mockImplementation((cmd: any, args: any) => {
        if (cmd === 'gh') return { status: 0, stdout: Buffer.from('test-branch\n') } as any;
        if (cmd === 'ssh' && args[1].includes('cat') && args[1].includes('.exit')) {
          return { status: 0, stdout: Buffer.from('0\n') } as any;
        }
        return { status: 0, stdout: Buffer.from('') } as any;
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runChecker(['123']);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ build     : SUCCESS'));
      consoleSpy.mockRestore();
    });
  });

  describe('clean.ts', () => {
    it('should kill tmux server', async () => {
      vi.mocked(readline.createInterface).mockReturnValue({
        question: vi.fn((q, cb) => cb('n')),
        close: vi.fn()
      } as any);
      await runCleanup();
      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      expect(spawnCalls.some(call => Array.isArray(call[1]) && call[1].some(arg => arg === 'tmux kill-server'))).toBe(true);
    });
  });
});
