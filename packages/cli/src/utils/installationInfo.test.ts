/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getInstallationInfo, PackageManager } from './installationInfo.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import { isGitRepository, debugLogger } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    isGitRepository: vi.fn(),
  };
});

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof fs>();
  return {
    ...actualFs,
    realpathSync: vi.fn(),
    existsSync: vi.fn(),
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

const mockedIsGitRepository = vi.mocked(isGitRepository);
const mockedRealPathSync = vi.mocked(fs.realpathSync);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedExecSync = vi.mocked(childProcess.execSync);

describe('getInstallationInfo', () => {
  const projectRoot = '/path/to/project';
  let originalArgv: string[];

  beforeEach(() => {
    vi.resetAllMocks();
    originalArgv = [...process.argv];
    // Default the working directory to the project root. Tests that launch
    // the CLI from somewhere else override this.
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    vi.spyOn(debugLogger, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('should detect running as a standalone binary', () => {
    vi.stubEnv('IS_BINARY', 'true');
    process.argv[1] = '/path/to/binary';
    const info = getInstallationInfo(projectRoot, true);
    expect(info.packageManager).toBe(PackageManager.BINARY);
    expect(info.isGlobal).toBe(true);
    expect(info.updateMessage).toBe(
      'Running as a standalone binary. Please update by downloading the latest version from GitHub.',
    );
    expect(info.updateCommand).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it('should return UNKNOWN when cliPath is not available', () => {
    process.argv[1] = '';
    const info = getInstallationInfo(projectRoot, true);
    expect(info.packageManager).toBe(PackageManager.UNKNOWN);
  });

  it('should return UNKNOWN and log error if realpathSync fails', () => {
    process.argv[1] = '/path/to/cli';
    const error = new Error('realpath failed');
    mockedRealPathSync.mockImplementation(() => {
      throw error;
    });

    const info = getInstallationInfo(projectRoot, true);

    expect(info.packageManager).toBe(PackageManager.UNKNOWN);
    expect(debugLogger.log).toHaveBeenCalledWith(error);
  });

  it('should detect running from a local git clone', () => {
    process.argv[1] = `${projectRoot}/packages/cli/dist/index.js`;
    mockedRealPathSync.mockReturnValue(
      `${projectRoot}/packages/cli/dist/index.js`,
    );
    mockedIsGitRepository.mockReturnValue(true);

    const info = getInstallationInfo(projectRoot, true);

    expect(mockedIsGitRepository).toHaveBeenCalledWith(
      path.dirname(`${projectRoot}/packages/cli/dist/index.js`),
    );
    expect(info.packageManager).toBe(PackageManager.UNKNOWN);
    expect(info.isGlobal).toBe(false);
    expect(info.updateCommand).toBeUndefined();
    expect(info.updateMessage).toBe(
      'Running from a local git clone. Please update with "git pull".',
    );
  });

  it('should detect a source checkout when run from an unrelated directory', () => {
    const cloneRoot = '/home/user/gemini-cli';
    const cliPath = `${cloneRoot}/bundle/gemini.js`;
    const unrelatedDir = '/tmp/not-a-git-repo';
    process.argv[1] = cliPath;
    mockedRealPathSync.mockReturnValue(cliPath);
    vi.spyOn(process, 'cwd').mockReturnValue(unrelatedDir);
    mockedIsGitRepository.mockImplementation(
      (directory) => directory === path.dirname(cliPath),
    );

    const info = getInstallationInfo(unrelatedDir, true);

    expect(mockedIsGitRepository).toHaveBeenCalledWith(path.dirname(cliPath));
    expect(info.packageManager).toBe(PackageManager.UNKNOWN);
    expect(info.isGlobal).toBe(false);
    expect(info.updateCommand).toBeUndefined();
    expect(info.updateMessage).toBe(
      'Running from a local git clone. Please update with "git pull".',
    );
  });

  it('should detect a source checkout when the current directory is another git repository', () => {
    const cloneRoot = '/home/user/gemini-cli';
    const cliPath = `${cloneRoot}/packages/cli/dist/index.js`;
    const otherRepo = '/home/user/some-other-project';
    process.argv[1] = cliPath;
    mockedRealPathSync.mockReturnValue(cliPath);
    vi.spyOn(process, 'cwd').mockReturnValue(otherRepo);
    mockedIsGitRepository.mockImplementation(
      (directory) =>
        directory === path.dirname(cliPath) || directory === otherRepo,
    );

    const info = getInstallationInfo(otherRepo, true);

    expect(mockedIsGitRepository).toHaveBeenCalledWith(path.dirname(cliPath));
    expect(info.packageManager).toBe(PackageManager.UNKNOWN);
    expect(info.isGlobal).toBe(false);
    expect(info.updateCommand).toBeUndefined();
    expect(info.updateMessage).toBe(
      'Running from a local git clone. Please update with "git pull".',
    );
  });

  it('should detect a global npm install when the current directory is a git repository', () => {
    const cwd = '/home/user/some-other-repo';
    const cliPath =
      '/usr/local/lib/node_modules/@google/gemini-cli/dist/index.js';
    process.argv[1] = cliPath;
    mockedRealPathSync.mockReturnValue(cliPath);
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    // Both the working directory and the install location report a git
    // repository. The node_modules segment is what keeps this global.
    mockedIsGitRepository.mockReturnValue(true);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });

    const info = getInstallationInfo(cwd, true);

    expect(info.packageManager).toBe(PackageManager.NPM);
    expect(info.isGlobal).toBe(true);
    expect(info.updateCommand).toBe('npm install -g @google/gemini-cli@latest');
    expect(info.updateMessage).toContain(
      'Installed with npm. Attempting to automatically update now...',
    );
  });

  it('should detect a source checkout when an ancestor directory is named homebrew', () => {
    const cliPath = '/home/homebrew/gemini-cli/bundle/gemini.js';
    const unrelatedDir = '/tmp/not-the-clone';
    process.argv[1] = cliPath;
    mockedRealPathSync.mockReturnValue(cliPath);
    vi.spyOn(process, 'cwd').mockReturnValue(unrelatedDir);
    mockedIsGitRepository.mockImplementation(
      (directory) => directory === path.dirname(cliPath),
    );
    mockedExecSync.mockImplementation(() => {
      throw new Error('gemini-cli is not installed via Homebrew');
    });

    const info = getInstallationInfo(unrelatedDir, true);

    expect(info.packageManager).toBe(PackageManager.UNKNOWN);
    expect(info.isGlobal).toBe(false);
    expect(info.updateCommand).toBeUndefined();
    expect(info.updateMessage).toBe(
      'Running from a local git clone. Please update with "git pull".',
    );
  });

  it('should detect running via npx', () => {
    const npxPath = `/Users/test/.npm/_npx/12345/bin/gemini`;
    process.argv[1] = npxPath;
    mockedRealPathSync.mockReturnValue(npxPath);

    const info = getInstallationInfo(projectRoot, true);

    expect(info.packageManager).toBe(PackageManager.NPX);
    expect(info.isGlobal).toBe(false);
    expect(info.updateMessage).toBe('Running via npx, update not applicable.');
  });

  it('should detect running via pnpx', () => {
    const pnpxPath = `/Users/test/.pnpm/_pnpx/12345/bin/gemini`;
    process.argv[1] = pnpxPath;
    mockedRealPathSync.mockReturnValue(pnpxPath);

    const info = getInstallationInfo(projectRoot, true);

    expect(info.packageManager).toBe(PackageManager.PNPX);
    expect(info.isGlobal).toBe(false);
    expect(info.updateMessage).toBe('Running via pnpx, update not applicable.');
  });

  it('should detect running via bunx', () => {
    const bunxPath = `/Users/test/.bun/install/cache/12345/bin/gemini`;
    process.argv[1] = bunxPath;
    mockedRealPathSync.mockReturnValue(bunxPath);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });

    const info = getInstallationInfo(projectRoot, true);

    expect(info.packageManager).toBe(PackageManager.BUNX);
    expect(info.isGlobal).toBe(false);
    expect(info.updateMessage).toBe('Running via bunx, update not applicable.');
  });

  it('should detect Homebrew installation via execSync', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    // Use a path that matches what brew would resolve to
    const cliPath = '/opt/homebrew/Cellar/gemini-cli/1.0.0/bin/gemini';
    process.argv[1] = cliPath;

    mockedExecSync.mockImplementation((cmd) => {
      if (typeof cmd === 'string' && cmd.includes('brew --prefix gemini-cli')) {
        return '/opt/homebrew/opt/gemini-cli';
      }
      throw new Error(`Command failed: ${cmd}`);
    });

    mockedRealPathSync.mockImplementation((p) => {
      if (p === cliPath) return cliPath;
      if (p === '/opt/homebrew/opt/gemini-cli') {
        return '/opt/homebrew/Cellar/gemini-cli/1.0.0';
      }
      return String(p);
    });

    const info = getInstallationInfo(projectRoot, true);

    expect(mockedExecSync).toHaveBeenCalledWith(
      expect.stringContaining('brew --prefix gemini-cli'),
      expect.anything(),
    );
    expect(info.packageManager).toBe(PackageManager.HOMEBREW);
    expect(info.isGlobal).toBe(true);
    expect(info.updateMessage).toBe(
      'Installed via Homebrew. Please update with "brew upgrade gemini-cli".',
    );
  });

  it('should detect Homebrew when the Homebrew prefix is a git repository', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    const cliPath = '/opt/homebrew/Cellar/gemini-cli/1.0.0/bin/gemini';
    process.argv[1] = cliPath;
    // Homebrew's prefix is a git clone, so walking up from the Cellar
    // path finds a repository. That must not win over the brew check.
    mockedIsGitRepository.mockReturnValue(true);
    mockedExecSync.mockImplementation((cmd) => {
      if (typeof cmd === 'string' && cmd.includes('brew --prefix gemini-cli')) {
        return '/opt/homebrew/opt/gemini-cli';
      }
      throw new Error(`Command failed: ${cmd}`);
    });
    mockedRealPathSync.mockImplementation((p) => {
      if (p === cliPath) return cliPath;
      if (p === '/opt/homebrew/opt/gemini-cli') {
        return '/opt/homebrew/Cellar/gemini-cli/1.0.0';
      }
      return String(p);
    });

    const info = getInstallationInfo('/home/user/unrelated-repo', true);

    expect(info.packageManager).toBe(PackageManager.HOMEBREW);
    expect(info.isGlobal).toBe(true);
    expect(info.updateMessage).toBe(
      'Installed via Homebrew. Please update with "brew upgrade gemini-cli".',
    );
  });

  it('should fall through if brew command fails', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    const cliPath = '/usr/local/bin/gemini';
    process.argv[1] = cliPath;
    mockedRealPathSync.mockReturnValue(cliPath);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });

    const info = getInstallationInfo(projectRoot, true);

    expect(mockedExecSync).toHaveBeenCalledWith(
      expect.stringContaining('brew --prefix gemini-cli'),
      expect.anything(),
    );
    // Should fall back to default global npm
    expect(info.packageManager).toBe(PackageManager.NPM);
    expect(info.isGlobal).toBe(true);
  });

  it('should detect global pnpm installation', () => {
    const pnpmPath = `/Users/test/.pnpm/global/5/node_modules/.pnpm/some-hash/node_modules/@google/gemini-cli/dist/index.js`;
    process.argv[1] = pnpmPath;
    mockedRealPathSync.mockReturnValue(pnpmPath);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });

    // isAutoUpdateEnabled = true -> "Attempting to automatically update"
    const info = getInstallationInfo(projectRoot, true);
    expect(info.packageManager).toBe(PackageManager.PNPM);
    expect(info.isGlobal).toBe(true);
    expect(info.updateCommand).toBe('pnpm add -g @google/gemini-cli@latest');
    expect(info.updateMessage).toContain('Attempting to automatically update');

    // isAutoUpdateEnabled = false -> "Please run..."
    const infoDisabled = getInstallationInfo(projectRoot, false);
    expect(infoDisabled.updateMessage).toContain('Please run pnpm add');
  });

  it('should detect global yarn installation', () => {
    const yarnPath = `/Users/test/.yarn/global/node_modules/@google/gemini-cli/dist/index.js`;
    process.argv[1] = yarnPath;
    mockedRealPathSync.mockReturnValue(yarnPath);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });

    // isAutoUpdateEnabled = true -> "Attempting to automatically update"
    const info = getInstallationInfo(projectRoot, true);
    expect(info.packageManager).toBe(PackageManager.YARN);
    expect(info.isGlobal).toBe(true);
    expect(info.updateCommand).toBe(
      'yarn global add @google/gemini-cli@latest',
    );
    expect(info.updateMessage).toContain('Attempting to automatically update');

    // isAutoUpdateEnabled = false -> "Please run..."
    const infoDisabled = getInstallationInfo(projectRoot, false);
    expect(infoDisabled.updateMessage).toContain('Please run yarn global add');
  });

  it('should detect global bun installation', () => {
    const bunPath = `/Users/test/.bun/install/global/node_modules/@google/gemini-cli/dist/index.js`;
    process.argv[1] = bunPath;
    mockedRealPathSync.mockReturnValue(bunPath);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });

    // isAutoUpdateEnabled = true -> "Attempting to automatically update"
    const info = getInstallationInfo(projectRoot, true);
    expect(info.packageManager).toBe(PackageManager.BUN);
    expect(info.isGlobal).toBe(true);
    expect(info.updateCommand).toBe('bun add -g @google/gemini-cli@latest');
    expect(info.updateMessage).toContain('Attempting to automatically update');

    // isAutoUpdateEnabled = false -> "Please run..."
    const infoDisabled = getInstallationInfo(projectRoot, false);
    expect(infoDisabled.updateMessage).toContain('Please run bun add');
  });

  it('should detect local installation and identify yarn from lockfile', () => {
    const localPath = `${projectRoot}/node_modules/.bin/gemini`;
    process.argv[1] = localPath;
    mockedRealPathSync.mockReturnValue(localPath);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });
    mockedExistsSync.mockImplementation(
      (p) => p === path.join(projectRoot, 'yarn.lock'),
    );

    const info = getInstallationInfo(projectRoot, true);

    expect(info.packageManager).toBe(PackageManager.YARN);
    expect(info.isGlobal).toBe(false);
    expect(info.updateMessage).toContain('Locally installed');
  });

  it('should detect local installation and identify pnpm from lockfile', () => {
    const localPath = `${projectRoot}/node_modules/.bin/gemini`;
    process.argv[1] = localPath;
    mockedRealPathSync.mockReturnValue(localPath);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });
    mockedExistsSync.mockImplementation(
      (p) => p === path.join(projectRoot, 'pnpm-lock.yaml'),
    );

    const info = getInstallationInfo(projectRoot, true);

    expect(info.packageManager).toBe(PackageManager.PNPM);
    expect(info.isGlobal).toBe(false);
  });

  it('should detect local installation and identify bun from lockfile', () => {
    const localPath = `${projectRoot}/node_modules/.bin/gemini`;
    process.argv[1] = localPath;
    mockedRealPathSync.mockReturnValue(localPath);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });
    mockedExistsSync.mockImplementation(
      (p) => p === path.join(projectRoot, 'bun.lockb'),
    );

    const info = getInstallationInfo(projectRoot, true);

    expect(info.packageManager).toBe(PackageManager.BUN);
    expect(info.isGlobal).toBe(false);
  });

  it('should default to local npm installation if no lockfile is found', () => {
    const localPath = `${projectRoot}/node_modules/.bin/gemini`;
    process.argv[1] = localPath;
    mockedRealPathSync.mockReturnValue(localPath);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });
    mockedExistsSync.mockReturnValue(false); // No lockfiles

    const info = getInstallationInfo(projectRoot, true);

    expect(info.packageManager).toBe(PackageManager.NPM);
    expect(info.isGlobal).toBe(false);
  });

  it('should default to global npm installation for unrecognized paths', () => {
    const globalPath = `/usr/local/bin/gemini`;
    process.argv[1] = globalPath;
    mockedRealPathSync.mockReturnValue(globalPath);
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command failed');
    });

    // isAutoUpdateEnabled = true -> "Attempting to automatically update"
    const info = getInstallationInfo(projectRoot, true);
    expect(info.packageManager).toBe(PackageManager.NPM);
    expect(info.isGlobal).toBe(true);
    expect(info.updateCommand).toBe('npm install -g @google/gemini-cli@latest');
    expect(info.updateMessage).toContain('Attempting to automatically update');

    // isAutoUpdateEnabled = false -> "Please run..."
    const infoDisabled = getInstallationInfo(projectRoot, false);
    expect(infoDisabled.updateMessage).toContain('Please run npm install');
  });

  it('should detect Volta installation (Unix-style)', () => {
    const voltaPath =
      '/Users/test/.volta/tools/image/node/20.0.0/lib/node_modules/@google/gemini-cli/dist/index.js';
    process.argv[1] = voltaPath;
    mockedRealPathSync.mockReturnValue(voltaPath);

    const info = getInstallationInfo(projectRoot, true);

    expect(info.packageManager).toBe(PackageManager.VOLTA);
    expect(info.updateCommand).toBe('volta install @google/gemini-cli@latest');
  });

  it('should detect Volta installation (Windows-style)', () => {
    const voltaPath =
      'C:\\Users\\test\\AppData\\Local\\Volta\\tools\\image\\node\\20.0.0\\node_modules\\@google/gemini-cli\\dist\\index.js';
    process.argv[1] = voltaPath;
    mockedRealPathSync.mockReturnValue(voltaPath);

    const info = getInstallationInfo(projectRoot, true);

    expect(info.packageManager).toBe(PackageManager.VOLTA);
    expect(info.updateCommand).toBe('volta install @google/gemini-cli@latest');
  });

  it('should NOT detect Homebrew if gemini-cli is installed in brew but running from npm location', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    // Path looks like standard global NPM
    const cliPath =
      '/usr/local/lib/node_modules/@google/gemini-cli/dist/index.js';
    process.argv[1] = cliPath;

    // Setup mocks
    mockedExecSync.mockImplementation((cmd) => {
      if (typeof cmd === 'string' && cmd.includes('brew list')) {
        return Buffer.from('gemini-cli\n');
      }
      // Future proofing for the fix:
      if (typeof cmd === 'string' && cmd.includes('brew --prefix gemini-cli')) {
        return '/opt/homebrew/opt/gemini-cli';
      }
      throw new Error(`Command failed: ${cmd}`);
    });

    mockedRealPathSync.mockImplementation((p) => {
      if (p === cliPath) return cliPath;
      // Future proofing for the fix:
      if (p === '/opt/homebrew/opt/gemini-cli')
        return '/opt/homebrew/Cellar/gemini-cli/1.0.0';
      return String(p);
    });

    const info = getInstallationInfo(projectRoot, false);

    expect(info.packageManager).not.toBe(PackageManager.HOMEBREW);
    expect(info.packageManager).toBe(PackageManager.NPM);
  });
});
