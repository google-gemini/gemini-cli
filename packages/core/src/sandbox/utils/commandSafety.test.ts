/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  isStrictlyApproved,
  isKnownSafeCommand,
  isDangerousCommand,
} from './commandSafety.js';
import * as paths from '../../utils/paths.js';

vi.mock('../../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/paths.js')>();
  return {
    ...actual,
    resolveToRealPath: vi.fn((p: string) => p),
    isTrustedSystemPath: vi.fn(() => false),
  };
});

describe('commandSafety', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('rg specific logic', () => {
    it('should consider rg safe without unsafe args if path is trusted', () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/usr/bin/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(true);

      // Using isKnownSafeCommand which calls isSafeToCallWithExec under the hood
      expect(isKnownSafeCommand(['/usr/bin/rg', 'pattern', 'file.txt'])).toBe(
        true,
      );
      expect(paths.resolveToRealPath).toHaveBeenCalledWith('/usr/bin/rg');
      expect(paths.isTrustedSystemPath).toHaveBeenCalledWith('/usr/bin/rg');
    });

    it('should not consider bare rg safe (Search Path Interruption prevention)', () => {
      // Bare 'rg' is not an absolute path, so it fails `isTrustedCommandPath`
      expect(isKnownSafeCommand(['rg', 'pattern', 'file.txt'])).toBe(false);
    });

    it('should not consider rg safe with unsafe args even if path is trusted', () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/usr/bin/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(true);

      expect(
        isKnownSafeCommand(['/usr/bin/rg', '--search-zip', 'pattern']),
      ).toBe(false);
      expect(isKnownSafeCommand(['/usr/bin/rg', '-z', 'pattern'])).toBe(false);
      expect(isKnownSafeCommand(['/usr/bin/rg', '--pre=cat', 'pattern'])).toBe(
        false,
      );
    });

    it('should consider rg dangerous with unsafe args', () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/usr/bin/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(true);

      expect(
        isDangerousCommand(['/usr/bin/rg', '--search-zip', 'pattern']),
      ).toBe(true);
      expect(isDangerousCommand(['/usr/bin/rg', '--pre=cat', 'pattern'])).toBe(
        true,
      );
    });

    it('should not consider rg safe if path is untrusted', () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/tmp/malicious/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(false);

      expect(isKnownSafeCommand(['/tmp/malicious/rg', 'pattern'])).toBe(false);
      expect(paths.resolveToRealPath).toHaveBeenCalledWith('/tmp/malicious/rg');
    });

    it('should not consider rg safe if path resolution throws', () => {
      vi.mocked(paths.resolveToRealPath).mockImplementation(() => {
        throw new Error('Resolution failed');
      });
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(true);

      expect(isKnownSafeCommand(['/some/path/rg', 'pattern'])).toBe(false);
    });

    it('should flag untrusted rg as dangerous if it has unsafe args (Paranoid validation)', () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/tmp/malicious/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(false);

      // isDangerousCommand relies on isRipgrepCommand, which strictly identifies intent (name)
      // and doesn't care about path safety. So even an untrusted rg will be flagged if it has unsafe args.
      expect(isDangerousCommand(['/tmp/malicious/rg', '--search-zip'])).toBe(
        true,
      );
    });
  });

  describe('isStrictlyApproved', () => {
    it('should approve rg if explicitly in approved tools regardless of path', async () => {
      // In this case, isStrictlyApproved relies on `tools.includes(command)`
      expect(
        await isStrictlyApproved(
          '/tmp/malicious/rg',
          ['pattern'],
          ['/tmp/malicious/rg'],
        ),
      ).toBe(true);
    });

    it('should approve rg if path is trusted', async () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/usr/bin/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(true);

      expect(await isStrictlyApproved('/usr/bin/rg', ['pattern'])).toBe(true);
    });

    it('should reject rg if path is untrusted and not explicitly approved', async () => {
      vi.mocked(paths.resolveToRealPath).mockReturnValue('/tmp/malicious/rg');
      vi.mocked(paths.isTrustedSystemPath).mockReturnValue(false);

      expect(await isStrictlyApproved('/tmp/malicious/rg', ['pattern'])).toBe(
        false,
      );
    });
  });

  describe('workspace path boundary validation in isKnownSafeCommand', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-safety-'),
    );
    const workspaceDir = path.join(tempDir, 'workspace');
    const outsideDir = path.join(tempDir, 'outside');

    beforeEach(() => {
      fs.mkdirSync(workspaceDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });
      fs.writeFileSync(
        path.join(workspaceDir, 'in_workspace.txt'),
        'in workspace',
      );
      fs.writeFileSync(path.join(outsideDir, 'outside.txt'), 'outside content');
    });

    it('should consider ls or cat safe with in-workspace arguments', () => {
      expect(
        isKnownSafeCommand(
          ['ls', 'in_workspace.txt'],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(true);
      expect(
        isKnownSafeCommand(
          ['cat', 'in_workspace.txt'],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(true);
    });

    it('should reject ls or cat when argument traverses outside workspace', () => {
      expect(
        isKnownSafeCommand(
          ['ls', '../outside/outside.txt'],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(false);
      expect(
        isKnownSafeCommand(
          ['cat', path.join(outsideDir, 'outside.txt')],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(false);
    });

    it('should reject safe commands accessing a symlink pointing outside workspace', () => {
      const symlinkPath = path.join(workspaceDir, 'my_link');
      if (!fs.existsSync(symlinkPath)) {
        fs.symlinkSync(outsideDir, symlinkPath);
      }

      expect(
        isKnownSafeCommand(['ls', 'my_link'], workspaceDir, workspaceDir),
      ).toBe(false);
      expect(
        isKnownSafeCommand(
          ['cat', 'my_link/outside.txt'],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(false);
    });

    it('should reject commands with unresolved shell variable expansions in paths', () => {
      expect(
        isKnownSafeCommand(['ls', '${d}'], workspaceDir, workspaceDir),
      ).toBe(false);
      expect(
        isKnownSafeCommand(['cat', '$SECRET_PATH'], workspaceDir, workspaceDir),
      ).toBe(false);
    });

    it('should reject commands with user-specific tilde expansions', () => {
      expect(
        isKnownSafeCommand(['ls', '~root/secret'], workspaceDir, workspaceDir),
      ).toBe(false);
    });

    it('should reject commands when effectiveCwd is outside workspace', () => {
      expect(isKnownSafeCommand(['ls'], outsideDir, workspaceDir)).toBe(false);
      expect(isKnownSafeCommand(['pwd'], outsideDir, workspaceDir)).toBe(false);
    });

    it('should reject grep or rg with file options pointing outside workspace', () => {
      const outsideFile = path.join(outsideDir, 'outside.txt');
      expect(
        isKnownSafeCommand(
          ['grep', '--file', outsideFile, 'pattern'],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(false);
      expect(
        isKnownSafeCommand(
          ['grep', `-f${outsideFile}`, 'pattern'],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(false);
      expect(
        isKnownSafeCommand(
          ['/usr/bin/rg', '--file', outsideFile, 'pattern'],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(false);
    });

    it('should reject cd with switches escaping workspace and bare cd escaping', () => {
      expect(
        isKnownSafeCommand(
          ['cd', '-P', '../outside'],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(false);
      expect(
        isKnownSafeCommand(
          ['cd', '-L', '../outside'],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(false);
      expect(isKnownSafeCommand(['cd'], workspaceDir, workspaceDir)).toBe(
        false,
      );
    });

    it('should reject find commands with paths escaping workspace even with options', () => {
      expect(
        isKnownSafeCommand(
          ['find', '-L', outsideDir],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(false);
      expect(
        isKnownSafeCommand(
          ['find', '.', '-type', 'f', outsideDir],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(false);
    });

    it('should reject file-reading commands with options containing relative paths escaping workspace', () => {
      expect(
        isKnownSafeCommand(
          ['cat', '--output=subdir/../../outside/file'],
          workspaceDir,
          workspaceDir,
        ),
      ).toBe(false);
    });

    it('should reject file-reading commands and grep/rg when an argument starting with hyphen is an existing file escaping workspace', () => {
      const hyphenSymlinkName = '-escapedFile';
      const hyphenSymlinkPath = path.join(workspaceDir, hyphenSymlinkName);
      const outsideFile = path.join(outsideDir, 'outside.txt');
      fs.symlinkSync(outsideFile, hyphenSymlinkPath);

      try {
        expect(
          isKnownSafeCommand(
            ['cat', hyphenSymlinkName],
            workspaceDir,
            workspaceDir,
          ),
        ).toBe(false);

        expect(
          isKnownSafeCommand(
            ['grep', 'foo', hyphenSymlinkName],
            workspaceDir,
            workspaceDir,
          ),
        ).toBe(false);

        expect(
          isKnownSafeCommand(
            ['/usr/bin/rg', 'foo', hyphenSymlinkName],
            workspaceDir,
            workspaceDir,
          ),
        ).toBe(false);
      } finally {
        if (fs.existsSync(hyphenSymlinkPath)) {
          fs.unlinkSync(hyphenSymlinkPath);
        }
      }
    });
  });

  describe('ln command safety in isDangerousCommand', () => {
    it('should flag ln with symbolic flags as dangerous', () => {
      expect(isDangerousCommand(['ln', '-s', 'target', 'link'])).toBe(true);
      expect(isDangerousCommand(['ln', '-sf', 'target', 'link'])).toBe(true);
      expect(isDangerousCommand(['ln', '--symbolic', 'target', 'link'])).toBe(
        true,
      );
    });

    it('should not flag hard link ln without symbolic flag as dangerous', () => {
      expect(isDangerousCommand(['ln', 'target', 'link'])).toBe(false);
    });
  });
});
