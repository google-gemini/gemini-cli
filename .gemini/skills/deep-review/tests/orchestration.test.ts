import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync, spawn } from 'child_process';
import fs from 'fs';
import readline from 'readline';
import { runOrchestrator } from '../scripts/review.ts';
import { runSetup } from '../scripts/setup.ts';
import { runWorker } from '../scripts/worker.ts';
import { runChecker } from '../scripts/check.ts';
import { runCleanup } from '../scripts/clean.ts';

vi.mock('child_process');
vi.mock('fs');
vi.mock('readline');

describe('Deep Review Orchestration', () => {
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

    // Mock process methods to avoid real side effects
    vi.spyOn(process, 'chdir').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue('/test-cwd');
    
    // Default mock for spawnSync
    vi.mocked(spawnSync).mockImplementation((cmd: any, args: any) => {
      if (cmd === 'gh' && args?.[0] === 'pr' && args?.[1] === 'view') {
        return { status: 0, stdout: Buffer.from('test-branch\n'), stderr: Buffer.from('') } as any;
      }
      return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') } as any;
    });

    // Default mock for spawn (used in worker.ts)
    vi.mocked(spawn).mockImplementation(() => {
        const mockProc = {
            stdout: { pipe: vi.fn(), on: vi.fn() },
            stderr: { pipe: vi.fn(), on: vi.fn() },
            on: vi.fn((event, cb) => { if (event === 'close') cb(0); }),
            pid: 1234
        };
        return mockProc as any;
    });
  });

  describe('review.ts', () => {
    it('should construct the correct tmux session name from branch', async () => {
      await runOrchestrator(['123'], {});
      
      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const sshCall = spawnCalls.find(call => 
        (typeof call[0] === 'string' && call[0].includes('tmux new-session')) ||
        (Array.isArray(call[1]) && call[1].some(arg => typeof arg === 'string' && arg.includes('tmux new-session')))
      );

      expect(sshCall).toBeDefined();
      const cmdStr = typeof sshCall![0] === 'string' ? sshCall![0] : (sshCall![1] as string[]).join(' ');
      expect(cmdStr).toContain('test-host');
      expect(cmdStr).toContain('tmux new-session -s 123-test_branch');
    });

    it('should use isolated config path when setupType is isolated', async () => {
      const isolatedSettings = {
        ...mockSettings,
        maintainer: {
          ...mockSettings.maintainer,
          deepReview: {
            ...mockSettings.maintainer.deepReview,
            geminiSetup: 'isolated'
          }
        }
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(isolatedSettings));

      await runOrchestrator(['123'], {});

      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const sshCall = spawnCalls.find(call => {
        const cmdStr = typeof call[0] === 'string' ? call[0] : (Array.isArray(call[1]) ? call[1].join(' ') : '');
        return cmdStr.includes('GEMINI_CLI_HOME=~/.gemini-deep-review');
      });

      expect(sshCall).toBeDefined();
    });

    it('should launch in current terminal when NOT within a Gemini session', async () => {
      await runOrchestrator(['123'], {}); // No session IDs in env
      
      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const terminalCall = spawnCalls.find(call => {
        const cmdStr = typeof call[0] === 'string' ? call[0] : '';
        // In Direct Shell Mode, spawnSync(sshCmd, { stdio: 'inherit', ... })
        // Options are in the second argument (index 1)
        const options = call[1] as any;
        return cmdStr.includes('ssh -t test-host') && 
               cmdStr.includes('tmux attach-session') &&
               options?.stdio === 'inherit';
      });
      expect(terminalCall).toBeDefined();
    });

    it('should launch in background mode when --background flag is provided', async () => {
      await runOrchestrator(['123', '--background'], {});
      
      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const backgroundCall = spawnCalls.find(call => {
        const cmdStr = typeof call[0] === 'string' ? call[0] : (Array.isArray(call[1]) ? call[1].join(' ') : '');
        return cmdStr.includes('>') && cmdStr.includes('background.log');
      });
      expect(backgroundCall).toBeDefined();
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

    it('should correctly detect pre-existing setup when everything is present on remote', async () => {
      vi.mocked(spawnSync).mockImplementation((cmd: any, args: any) => {
        if (cmd === 'ssh') {
          const remoteCmd = args[1];
          // Mock .git folder existence check
          if (remoteCmd.includes('[ -d ~/test-dir/.git ]')) return { status: 0 } as any;
          // Mock successful dependency checks (gh, tmux)
          if (remoteCmd.includes('command -v')) return { status: 0 } as any;
          // Mock successful gh auth check
          if (remoteCmd.includes('gh auth status')) return { status: 0 } as any;
          // Mock gemini auth presence
          if (remoteCmd.includes('google_accounts.json')) return { status: 0 } as any;
        }
        return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') } as any;
      });

      mockInterface.question
        .mockImplementationOnce((q, cb) => cb('test-host'))
        .mockImplementationOnce((q, cb) => cb('~/test-dir'))
        .mockImplementationOnce((q, cb) => cb('p')) // gemini preexisting
        .mockImplementationOnce((q, cb) => cb('p')) // gh preexisting
        .mockImplementationOnce((q, cb) => cb('none'));

      await runSetup({ HOME: '/test-home' });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(call => 
        call[0].toString().includes('.gemini/settings.json')
      );
      expect(writeCall).toBeDefined();
      const savedSettings = JSON.parse(writeCall![1] as string);
      expect(savedSettings.maintainer.deepReview.geminiSetup).toBe('preexisting');
      expect(savedSettings.maintainer.deepReview.ghSetup).toBe('preexisting');
    });

    it('should offer to provision missing requirements (gh, tmux) on a net-new machine', async () => {
      vi.mocked(spawnSync).mockImplementation((cmd: any, args: any) => {
        if (cmd === 'ssh') {
          const remoteCmd = Array.isArray(args) ? args[args.length - 1] : args;
          // Mock missing dependencies
          if (remoteCmd.includes('command -v gh')) return { status: 1 } as any;
          if (remoteCmd.includes('command -v tmux')) return { status: 1 } as any;
          if (remoteCmd.includes('[ -d ~/test-dir/.git ]')) return { status: 1 } as any;
          if (remoteCmd.includes('uname -s')) return { status: 0, stdout: Buffer.from('Linux\n') } as any;
        }
        return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') } as any;
      });

      mockInterface.question
        .mockImplementationOnce((q, cb) => cb('test-host'))
        .mockImplementationOnce((q, cb) => cb('~/test-dir'))
        .mockImplementationOnce((q, cb) => cb('i')) // gemini isolated
        .mockImplementationOnce((q, cb) => cb('i')) // gh isolated
        .mockImplementationOnce((q, cb) => cb('y')) // provision requirements
        .mockImplementationOnce((q, cb) => cb('none'));

      await runSetup({ HOME: '/test-home' });

      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const installCall = spawnCalls.find(call => {
        const cmdStr = JSON.stringify(call);
        return cmdStr.includes('apt install -y gh tmux');
      });
      expect(installCall).toBeDefined();
    });

    it('should handle preexisting repo but missing tool auth', async () => {
      vi.mocked(spawnSync).mockImplementation((cmd: any, args: any) => {
        if (cmd === 'ssh') {
          const remoteCmd = args[1];
          if (remoteCmd.includes('[ -d ~/test-dir/.git ]')) return { status: 0 } as any;
          if (remoteCmd.includes('gh auth status')) return { status: 1 } as any; // GH not auth'd
          if (remoteCmd.includes('google_accounts.json')) return { status: 1 } as any; // Gemini not auth'd
          if (remoteCmd.includes('command -v')) return { status: 0 } as any; // dependencies present
        }
        return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') } as any;
      });

      vi.mocked(fs.existsSync).mockImplementation((p) => p.toString().includes('google_accounts.json'));

      mockInterface.question
        .mockImplementationOnce((q, cb) => cb('test-host'))
        .mockImplementationOnce((q, cb) => cb('~/test-dir'))
        .mockImplementationOnce((q, cb) => cb('i')) // user chooses isolated gemini despite existing repo
        .mockImplementationOnce((q, cb) => cb('p')) // user chooses preexisting gh
        .mockImplementationOnce((q, cb) => cb('y')) // sync gemini auth
        .mockImplementationOnce((q, cb) => cb('none'));

      await runSetup({ HOME: '/test-home' });

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(call => 
        call[0].toString().includes('.gemini/settings.json')
      );
      const savedSettings = JSON.parse(writeCall![1] as string);
      expect(savedSettings.maintainer.deepReview.geminiSetup).toBe('isolated');
      expect(savedSettings.maintainer.deepReview.ghSetup).toBe('preexisting');
      expect(savedSettings.maintainer.deepReview.syncAuth).toBe(true);
    });
  });

  describe('worker.ts', () => {
    it('should launch parallel tasks and write exit codes', async () => {
      // Mock targetDir existing
      vi.mocked(fs.existsSync).mockImplementation((p) => p.toString().includes('test-branch'));
      
      const workerPromise = runWorker(['123', 'test-branch', '/test-policy.toml']);
      
      // Since worker uses setInterval/setTimeout, we might need to advance timers 
      // or ensure the close event triggers everything
      await workerPromise;

      const spawnCalls = vi.mocked(spawn).mock.calls;
      expect(spawnCalls.length).toBeGreaterThanOrEqual(4); // build, ci, review, verify
      
      const buildCall = spawnCalls.find(call => call[0].includes('npm ci'));
      expect(buildCall).toBeDefined();

      const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const exitFileCall = writeCalls.find(call => call[0].toString().includes('build.exit'));
      expect(exitFileCall).toBeDefined();
      expect(exitFileCall![1]).toBe('0');
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
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✨ All remote tasks complete'));
      
      consoleSpy.mockRestore();
    });
  });

  describe('clean.ts', () => {
    it('should kill tmux server and remove directories', async () => {
      vi.mocked(readline.createInterface).mockReturnValue({
        question: vi.fn((q, cb) => cb('n')), // Don't wipe everything
        close: vi.fn()
      } as any);

      await runCleanup();

      const spawnCalls = vi.mocked(spawnSync).mock.calls;
      const killCall = spawnCalls.find(call => Array.isArray(call[1]) && call[1].some(arg => arg === 'tmux kill-server'));
      expect(killCall).toBeDefined();

      const rmCall = spawnCalls.find(call => Array.isArray(call[1]) && call[1].some(arg => arg.includes('rm -rf')));
      expect(rmCall).toBeDefined();
    });
  });
});
