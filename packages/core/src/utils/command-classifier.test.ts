/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  classifyCommand,
  isDestructiveCommand,
  getDestructiveWarning,
  getCategoryDescription,
} from './command-classifier.js';

describe('command-classifier', () => {
  describe('classifyCommand', () => {
    describe('git commands', () => {
      describe('read-only git subcommands', () => {
        const readOnlyCommands = [
          ['git', 'git status', 'status'],
          ['git', 'git log', 'log'],
          ['git', 'git log --oneline -10', 'log with flags'],
          ['git', 'git diff', 'diff'],
          ['git', 'git diff HEAD~1', 'diff with ref'],
          ['git', 'git show HEAD', 'show'],
          ['git', 'git branch', 'branch list'],
          ['git', 'git branch -a', 'branch list all'],
          ['git', 'git tag', 'tag list'],
          ['git', 'git remote -v', 'remote list'],
          ['git', 'git ls-files', 'ls-files'],
          ['git', 'git blame README.md', 'blame'],
          ['git', 'git --no-pager log', 'log with global option'],
          ['git', 'git reflog', 'reflog'],
          ['git', 'git config --get user.name', 'config get'],
          ['git', 'git config --list', 'config list'],
        ];

        it.each(readOnlyCommands)(
          'classifies %s %s as read-only (%s)',
          (rootCmd, fullCmd, _description) => {
            expect(classifyCommand(rootCmd, fullCmd)).toBe('read-only');
          },
        );
      });

      describe('write git subcommands', () => {
        const writeCommands = [
          ['git', 'git add .', 'add'],
          ['git', 'git commit -m "message"', 'commit'],
          ['git', 'git checkout main', 'checkout'],
          ['git', 'git switch feature', 'switch'],
          ['git', 'git merge develop', 'merge'],
          ['git', 'git rebase main', 'rebase (non-interactive)'],
          ['git', 'git cherry-pick abc123', 'cherry-pick'],
          ['git', 'git stash', 'stash'],
          ['git', 'git stash push', 'stash push'],
          ['git', 'git init', 'init'],
          ['git', 'git clone https://example.com/repo.git', 'clone'],
        ];

        it.each(writeCommands)(
          'classifies %s %s as write (%s)',
          (rootCmd, fullCmd, _description) => {
            expect(classifyCommand(rootCmd, fullCmd)).toBe('write');
          },
        );
      });

      describe('destructive git subcommands', () => {
        const destructiveCommands = [
          ['git', 'git push', 'push'],
          ['git', 'git push origin main', 'push to remote'],
          ['git', 'git push --force', 'force push'],
          ['git', 'git reset --hard', 'hard reset'],
          ['git', 'git reset --hard HEAD~1', 'hard reset to ref'],
          ['git', 'git clean -fd', 'clean'],
          ['git', 'git clean -fdx', 'clean with -x'],
          ['git', 'git branch -d feature', 'branch delete'],
          ['git', 'git branch -D feature', 'branch force delete'],
          ['git', 'git branch --delete feature', 'branch delete long'],
          ['git', 'git tag -d v1.0', 'tag delete'],
          ['git', 'git stash drop', 'stash drop'],
          ['git', 'git stash clear', 'stash clear'],
          ['git', 'git gc', 'garbage collection'],
          ['git', 'git prune', 'prune'],
          ['git', 'git checkout -f', 'checkout force'],
          ['git', 'git checkout --force', 'checkout force long'],
          ['git', 'git rebase -i HEAD~3', 'interactive rebase'],
          ['git', 'git rebase --interactive main', 'interactive rebase long'],
          ['git', 'git config user.name "New Name"', 'config set'],
          ['git', 'git remote add origin url', 'remote add'],
          ['git', 'git remote remove origin', 'remote remove'],
        ];

        it.each(destructiveCommands)(
          'classifies %s %s as destructive (%s)',
          (rootCmd, fullCmd, _description) => {
            expect(classifyCommand(rootCmd, fullCmd)).toBe('destructive');
          },
        );
      });
    });

    describe('common shell commands', () => {
      describe('read-only commands', () => {
        const readOnlyCommands = [
          ['ls', 'ls -la', 'ls'],
          ['cat', 'cat file.txt', 'cat'],
          ['grep', 'grep pattern file', 'grep'],
          ['find', 'find . -name "*.js"', 'find'],
          ['ps', 'ps aux', 'ps'],
          ['echo', 'echo hello', 'echo'],
          ['pwd', 'pwd', 'pwd'],
          ['head', 'head -n 10 file', 'head'],
          ['tail', 'tail -f log', 'tail'],
          ['wc', 'wc -l file', 'wc'],
        ];

        it.each(readOnlyCommands)(
          'classifies %s (%s) as read-only',
          (rootCmd, fullCmd, _description) => {
            expect(classifyCommand(rootCmd, fullCmd)).toBe('read-only');
          },
        );
      });

      describe('destructive commands', () => {
        const destructiveCommands = [
          ['rm', 'rm file.txt', 'rm'],
          ['rm', 'rm -rf directory', 'rm -rf'],
          ['rm', 'rm -r directory', 'rm -r'],
          ['chmod', 'chmod 755 file', 'chmod'],
          ['chown', 'chown user:group file', 'chown'],
          ['docker', 'docker run image', 'docker'],
          ['kubectl', 'kubectl apply -f file.yaml', 'kubectl'],
        ];

        it.each(destructiveCommands)(
          'classifies %s (%s) as destructive',
          (rootCmd, fullCmd, _description) => {
            expect(classifyCommand(rootCmd, fullCmd)).toBe('destructive');
          },
        );
      });

      describe('unknown commands default to write', () => {
        it('classifies unknown command as write', () => {
          expect(
            classifyCommand('my-custom-script', './my-custom-script.sh'),
          ).toBe('write');
        });
      });
    });
  });

  describe('isDestructiveCommand', () => {
    it('returns true for destructive commands', () => {
      expect(isDestructiveCommand('git', 'git push')).toBe(true);
      expect(isDestructiveCommand('git', 'git reset --hard')).toBe(true);
      expect(isDestructiveCommand('rm', 'rm -rf /')).toBe(true);
    });

    it('returns false for read-only commands', () => {
      expect(isDestructiveCommand('git', 'git status')).toBe(false);
      expect(isDestructiveCommand('ls', 'ls -la')).toBe(false);
    });

    it('returns false for write (non-destructive) commands', () => {
      expect(isDestructiveCommand('git', 'git add .')).toBe(false);
      expect(isDestructiveCommand('git', 'git commit -m "msg"')).toBe(false);
    });
  });

  describe('getDestructiveWarning', () => {
    it('returns warning for git push', () => {
      const warning = getDestructiveWarning('git', 'git push origin main');
      expect(warning).toContain('push');
      expect(warning).toContain('remote');
    });

    it('returns warning for git reset --hard', () => {
      const warning = getDestructiveWarning('git', 'git reset --hard HEAD~1');
      expect(warning).toContain('discard');
    });

    it('returns warning for git clean', () => {
      const warning = getDestructiveWarning('git', 'git clean -fd');
      expect(warning).toContain('untracked');
    });

    it('returns warning for rm', () => {
      const warning = getDestructiveWarning('rm', 'rm -rf directory');
      expect(warning).toContain('delete');
    });

    it('returns undefined for non-destructive commands', () => {
      expect(getDestructiveWarning('git', 'git status')).toBeUndefined();
      expect(getDestructiveWarning('ls', 'ls -la')).toBeUndefined();
    });
  });

  describe('getCategoryDescription', () => {
    it('returns correct descriptions', () => {
      expect(getCategoryDescription('read-only')).toBe('Read-only operation');
      expect(getCategoryDescription('write')).toBe('Modifies local state');
      expect(getCategoryDescription('destructive')).toBe(
        'Potentially destructive operation',
      );
    });
  });

  describe('edge cases', () => {
    it('handles git with global options before subcommand', () => {
      expect(classifyCommand('git', 'git --no-pager log')).toBe('read-only');
      expect(classifyCommand('git', 'git -C /path log')).toBe('read-only');
      expect(classifyCommand('git', 'git --git-dir=/path status')).toBe(
        'read-only',
      );
    });

    it('handles commands case-sensitively (shells are case-sensitive)', () => {
      // Shells are case-sensitive, so 'GIT' is not the same as 'git'
      // Unknown commands default to 'write' for safety
      expect(classifyCommand('GIT', 'GIT status')).toBe('write');
      // Lowercase git is recognized
      expect(classifyCommand('git', 'git status')).toBe('read-only');
    });

    it('handles reset without --hard as destructive by default', () => {
      // git reset without flags can still be disruptive
      expect(classifyCommand('git', 'git reset')).toBe('destructive');
    });

    it('handles chained commands by checking first command', () => {
      // The classifier is called per-command after parsing
      expect(classifyCommand('git', 'git status')).toBe('read-only');
      expect(classifyCommand('git', 'git push')).toBe('destructive');
    });
  });
});
