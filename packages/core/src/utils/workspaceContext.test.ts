/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WorkspaceContext } from './workspaceContext.js';

describe('WorkspaceContext with real filesystem', () => {
  let tempDir: string;
  let cwd: string;
  let otherDir: string;

  beforeEach(() => {
    // os.tmpdir() can return a path using a symlink (this is standard on macOS)
    // Use fs.realpathSync to fully resolve the absolute path.
    tempDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-context-test-')),
    );

    cwd = path.join(tempDir, 'project');
    otherDir = path.join(tempDir, 'other-project');

    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(otherDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should initialize with a single directory (cwd)', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      const directories = workspaceContext.getDirectories();

      expect(directories).toEqual([cwd]);
    });

    it('should validate and resolve directories to absolute paths', () => {
      const workspaceContext = new WorkspaceContext(cwd, [otherDir]);
      const directories = workspaceContext.getDirectories();

      expect(directories).toEqual([cwd, otherDir]);
    });

    it('should handle empty initialization', () => {
      const workspaceContext = new WorkspaceContext(cwd, []);
      const directories = workspaceContext.getDirectories();
      expect(directories).toHaveLength(1);
      expect(fs.realpathSync(directories[0])).toBe(cwd);
    });
  });

  describe('adding directories', () => {
    it('should add valid directories', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      workspaceContext.addDirectory(otherDir);
      const directories = workspaceContext.getDirectories();

      expect(directories).toEqual([cwd, otherDir]);
    });

    it('should resolve relative paths to absolute', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      const relativePath = path.relative(cwd, otherDir);
      workspaceContext.addDirectory(relativePath, cwd);
      const directories = workspaceContext.getDirectories();

      expect(directories).toEqual([cwd, otherDir]);
    });

    it('should prevent duplicate directories', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      workspaceContext.addDirectory(otherDir);
      workspaceContext.addDirectory(otherDir);
      const directories = workspaceContext.getDirectories();

      expect(directories).toHaveLength(2);
    });

    it('should handle symbolic links correctly', () => {
      const realDir = path.join(tempDir, 'real');
      fs.mkdirSync(realDir, { recursive: true });
      const symlinkDir = path.join(tempDir, 'symlink-to-real');
      fs.symlinkSync(realDir, symlinkDir, 'dir');
      const workspaceContext = new WorkspaceContext(cwd);
      workspaceContext.addDirectory(symlinkDir);

      const directories = workspaceContext.getDirectories();

      expect(directories).toEqual([cwd, realDir]);
    });
  });

  describe('path validation', () => {
    it('should accept paths within workspace directories', () => {
      const workspaceContext = new WorkspaceContext(cwd, [otherDir]);
      const validPath1 = path.join(cwd, 'src', 'file.ts');
      const validPath2 = path.join(otherDir, 'lib', 'module.js');

      fs.mkdirSync(path.dirname(validPath1), { recursive: true });
      fs.writeFileSync(validPath1, 'content');
      fs.mkdirSync(path.dirname(validPath2), { recursive: true });
      fs.writeFileSync(validPath2, 'content');

      expect(workspaceContext.isPathWithinWorkspace(validPath1)).toBe(true);
      expect(workspaceContext.isPathWithinWorkspace(validPath2)).toBe(true);
    });

    it('should accept non-existent paths within workspace directories', () => {
      const workspaceContext = new WorkspaceContext(cwd, [otherDir]);
      const validPath1 = path.join(cwd, 'src', 'file.ts');
      const validPath2 = path.join(otherDir, 'lib', 'module.js');

      expect(workspaceContext.isPathWithinWorkspace(validPath1)).toBe(true);
      expect(workspaceContext.isPathWithinWorkspace(validPath2)).toBe(true);
    });

    it('should reject paths outside workspace', () => {
      const workspaceContext = new WorkspaceContext(cwd, [otherDir]);
      const invalidPath = path.join(tempDir, 'outside-workspace', 'file.txt');

      expect(workspaceContext.isPathWithinWorkspace(invalidPath)).toBe(false);
    });

    it('should reject non-existent paths outside workspace', () => {
      const workspaceContext = new WorkspaceContext(cwd, [otherDir]);
      const invalidPath = path.join(tempDir, 'outside-workspace', 'file.txt');

      expect(workspaceContext.isPathWithinWorkspace(invalidPath)).toBe(false);
    });

    it('should handle nested directories correctly', () => {
      const workspaceContext = new WorkspaceContext(cwd, [otherDir]);
      const nestedPath = path.join(cwd, 'deeply', 'nested', 'path', 'file.txt');
      expect(workspaceContext.isPathWithinWorkspace(nestedPath)).toBe(true);
    });

    it('should handle edge cases (root, parent references)', () => {
      const workspaceContext = new WorkspaceContext(cwd, [otherDir]);
      const rootPath = path.parse(tempDir).root;
      const parentPath = path.dirname(cwd);

      expect(workspaceContext.isPathWithinWorkspace(rootPath)).toBe(false);
      expect(workspaceContext.isPathWithinWorkspace(parentPath)).toBe(false);
    });

    it('should handle non-existent paths correctly', () => {
      const workspaceContext = new WorkspaceContext(cwd, [otherDir]);
      const nonExistentPath = path.join(cwd, 'does-not-exist.txt');
      expect(workspaceContext.isPathWithinWorkspace(nonExistentPath)).toBe(
        true,
      );
    });

    describe('with symbolic link', () => {
      describe('in the workspace', () => {
        let realDir: string;
        let symlinkDir: string;
        beforeEach(() => {
          realDir = path.join(cwd, 'real-dir');
          fs.mkdirSync(realDir, { recursive: true });

          symlinkDir = path.join(cwd, 'symlink-file');
          fs.symlinkSync(realDir, symlinkDir, 'dir');
        });

        it('should accept dir paths', () => {
          const workspaceContext = new WorkspaceContext(cwd);

          expect(workspaceContext.isPathWithinWorkspace(symlinkDir)).toBe(true);
        });

        it('should accept non-existent paths', () => {
          const filePath = path.join(symlinkDir, 'does-not-exist.txt');

          const workspaceContext = new WorkspaceContext(cwd);

          expect(workspaceContext.isPathWithinWorkspace(filePath)).toBe(true);
        });

        it('should accept non-existent deep paths', () => {
          const filePath = path.join(symlinkDir, 'deep', 'does-not-exist.txt');

          const workspaceContext = new WorkspaceContext(cwd);

          expect(workspaceContext.isPathWithinWorkspace(filePath)).toBe(true);
        });
      });

      describe('outside the workspace', () => {
        let realDir: string;
        let symlinkDir: string;
        beforeEach(() => {
          realDir = path.join(tempDir, 'real-dir');
          fs.mkdirSync(realDir, { recursive: true });

          symlinkDir = path.join(cwd, 'symlink-file');
          fs.symlinkSync(realDir, symlinkDir, 'dir');
        });

        it('should reject dir paths', () => {
          const workspaceContext = new WorkspaceContext(cwd);

          expect(workspaceContext.isPathWithinWorkspace(symlinkDir)).toBe(
            false,
          );
        });

        it('should reject non-existent paths', () => {
          const filePath = path.join(symlinkDir, 'does-not-exist.txt');

          const workspaceContext = new WorkspaceContext(cwd);

          expect(workspaceContext.isPathWithinWorkspace(filePath)).toBe(false);
        });

        it('should reject non-existent deep paths', () => {
          const filePath = path.join(symlinkDir, 'deep', 'does-not-exist.txt');

          const workspaceContext = new WorkspaceContext(cwd);

          expect(workspaceContext.isPathWithinWorkspace(filePath)).toBe(false);
        });

        it('should reject partially non-existent deep paths', () => {
          const deepDir = path.join(symlinkDir, 'deep');
          fs.mkdirSync(deepDir, { recursive: true });
          const filePath = path.join(deepDir, 'does-not-exist.txt');

          const workspaceContext = new WorkspaceContext(cwd);

          expect(workspaceContext.isPathWithinWorkspace(filePath)).toBe(false);
        });
      });

      it('should reject symbolic file links outside the workspace', () => {
        const realFile = path.join(tempDir, 'real-file.txt');
        fs.writeFileSync(realFile, 'content');

        const symlinkFile = path.join(cwd, 'symlink-to-real-file');
        fs.symlinkSync(realFile, symlinkFile, 'file');

        const workspaceContext = new WorkspaceContext(cwd);

        expect(workspaceContext.isPathWithinWorkspace(symlinkFile)).toBe(false);
      });

      it('should reject non-existent symbolic file links outside the workspace', () => {
        const realFile = path.join(tempDir, 'real-file.txt');

        const symlinkFile = path.join(cwd, 'symlink-to-real-file');
        fs.symlinkSync(realFile, symlinkFile, 'file');

        const workspaceContext = new WorkspaceContext(cwd);

        expect(workspaceContext.isPathWithinWorkspace(symlinkFile)).toBe(false);
      });

      it('should handle circular symlinks gracefully', () => {
        const workspaceContext = new WorkspaceContext(cwd);
        const linkA = path.join(cwd, 'link-a');
        const linkB = path.join(cwd, 'link-b');
        // Create a circular dependency: linkA -> linkB -> linkA
        fs.symlinkSync(linkB, linkA, 'dir');
        fs.symlinkSync(linkA, linkB, 'dir');

        // fs.realpathSync should throw ELOOP, and isPathWithinWorkspace should
        // handle it gracefully and return false.
        expect(workspaceContext.isPathWithinWorkspace(linkA)).toBe(false);
        expect(workspaceContext.isPathWithinWorkspace(linkB)).toBe(false);
      });
    });
  });

  describe('onDirectoriesChanged', () => {
    it('should call listener when adding a directory', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      const listener = vi.fn();
      workspaceContext.onDirectoriesChanged(listener);

      workspaceContext.addDirectory(otherDir);

      expect(listener).toHaveBeenCalledOnce();
    });

    it('should not call listener when adding a duplicate directory', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      workspaceContext.addDirectory(otherDir);
      const listener = vi.fn();
      workspaceContext.onDirectoriesChanged(listener);

      workspaceContext.addDirectory(otherDir);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should call listener when setting different directories', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      const listener = vi.fn();
      workspaceContext.onDirectoriesChanged(listener);

      workspaceContext.setDirectories([otherDir]);

      expect(listener).toHaveBeenCalledOnce();
    });

    it('should not call listener when setting same directories', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      const listener = vi.fn();
      workspaceContext.onDirectoriesChanged(listener);

      workspaceContext.setDirectories([cwd]);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      workspaceContext.onDirectoriesChanged(listener1);
      workspaceContext.onDirectoriesChanged(listener2);

      workspaceContext.addDirectory(otherDir);

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
    });

    it('should allow unsubscribing a listener', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      const listener = vi.fn();
      const unsubscribe = workspaceContext.onDirectoriesChanged(listener);

      unsubscribe();
      workspaceContext.addDirectory(otherDir);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should not fail if a listener throws an error', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      const errorListener = () => {
        throw new Error('test error');
      };
      const listener = vi.fn();
      workspaceContext.onDirectoriesChanged(errorListener);
      workspaceContext.onDirectoriesChanged(listener);

      expect(() => {
        workspaceContext.addDirectory(otherDir);
      }).not.toThrow();
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('getDirectories', () => {
    it('should return a copy of directories array', () => {
      const workspaceContext = new WorkspaceContext(cwd);
      const dirs1 = workspaceContext.getDirectories();
      const dirs2 = workspaceContext.getDirectories();

      expect(dirs1).not.toBe(dirs2);
      expect(dirs1).toEqual(dirs2);
    });
  });
});

describe('WorkspaceContext with optional directories', () => {
  let tempDir: string;
  let cwd: string;
  let existingDir1: string;
  let existingDir2: string;
  let nonExistentDir: string;

  beforeEach(() => {
    tempDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-context-optional-')),
    );
    cwd = path.join(tempDir, 'project');
    existingDir1 = path.join(tempDir, 'existing-dir-1');
    existingDir2 = path.join(tempDir, 'existing-dir-2');
    nonExistentDir = path.join(tempDir, 'non-existent-dir');

    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(existingDir1, { recursive: true });
    fs.mkdirSync(existingDir2, { recursive: true });

    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should skip a missing optional directory and log a warning', () => {
    const workspaceContext = new WorkspaceContext(cwd, [
      nonExistentDir,
      existingDir1,
    ]);
    const directories = workspaceContext.getDirectories();
    expect(directories).toEqual([cwd, existingDir1]);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      `[WARN] Skipping unreadable directory: ${nonExistentDir} (Directory does not exist: ${nonExistentDir})`,
    );
  });

  it('should include an existing optional directory', () => {
    const workspaceContext = new WorkspaceContext(cwd, [existingDir1]);
    const directories = workspaceContext.getDirectories();
    expect(directories).toEqual([cwd, existingDir1]);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
