/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  classifyCommand,
  extractBinary,
  shouldPersist,
  isExactOnly,
  generateScopeOptions,
  getRecommendedScope,
} from './scope-generator.js';

describe('scope-generator', () => {
  describe('extractBinary', () => {
    it('should extract simple binary names', () => {
      expect(extractBinary('ls -la')).toBe('ls');
      expect(extractBinary('git status')).toBe('git');
      expect(extractBinary('npm install')).toBe('npm');
    });

    it('should handle paths', () => {
      expect(extractBinary('/usr/bin/ls -la')).toBe('ls');
      expect(extractBinary('/usr/local/bin/git status')).toBe('git');
    });

    it('should handle commands with no arguments', () => {
      expect(extractBinary('pwd')).toBe('pwd');
      expect(extractBinary('whoami')).toBe('whoami');
    });

    it('should lowercase the result', () => {
      expect(extractBinary('LS -LA')).toBe('ls');
      expect(extractBinary('Git status')).toBe('git');
    });

    it('should handle empty/whitespace', () => {
      expect(extractBinary('')).toBe('');
      expect(extractBinary('   ')).toBe('');
    });
  });

  describe('classifyCommand', () => {
    describe('read-only commands', () => {
      it('should classify file listing commands as read-only', () => {
        expect(classifyCommand('ls -la').intent).toBe('read-only');
        expect(classifyCommand('tree /src').intent).toBe('read-only');
        expect(classifyCommand('find . -name "*.ts"').intent).toBe('read-only');
      });

      it('should classify file reading commands as read-only', () => {
        expect(classifyCommand('cat file.txt').intent).toBe('read-only');
        expect(classifyCommand('head -n 10 file.txt').intent).toBe('read-only');
        expect(classifyCommand('tail -f log.txt').intent).toBe('read-only');
      });

      it('should classify text processing commands as read-only', () => {
        expect(classifyCommand('grep pattern file.txt').intent).toBe(
          'read-only',
        );
        expect(classifyCommand('wc -l file.txt').intent).toBe('read-only');
        expect(classifyCommand('sort file.txt').intent).toBe('read-only');
      });

      it('should classify system info commands as read-only', () => {
        expect(classifyCommand('pwd').intent).toBe('read-only');
        expect(classifyCommand('whoami').intent).toBe('read-only');
        expect(classifyCommand('date').intent).toBe('read-only');
        expect(classifyCommand('df -h').intent).toBe('read-only');
      });
    });

    describe('git commands', () => {
      it('should classify read-only git subcommands correctly', () => {
        expect(classifyCommand('git status').intent).toBe('read-only');
        expect(classifyCommand('git diff').intent).toBe('read-only');
        expect(classifyCommand('git log --oneline').intent).toBe('read-only');
        expect(classifyCommand('git branch -a').intent).toBe('read-only');
      });

      it('should classify write git subcommands correctly', () => {
        expect(classifyCommand('git add .').intent).toBe('write');
        expect(classifyCommand('git commit -m "msg"').intent).toBe('write');
        expect(classifyCommand('git push origin main').intent).toBe('write');
        expect(classifyCommand('git merge feature').intent).toBe('write');
      });

      it('should classify destructive git subcommands correctly', () => {
        expect(classifyCommand('git clean -fd').intent).toBe('destructive');
        expect(classifyCommand('git rm file.txt').intent).toBe('destructive');
      });
    });

    describe('package managers', () => {
      it('should classify read-only subcommands correctly', () => {
        expect(classifyCommand('npm list').intent).toBe('read-only');
        expect(classifyCommand('npm outdated').intent).toBe('read-only');
        expect(classifyCommand('yarn info package').intent).toBe('read-only');
      });

      it('should classify write subcommands correctly', () => {
        expect(classifyCommand('npm install').intent).toBe('write');
        expect(classifyCommand('yarn add package').intent).toBe('write');
        expect(classifyCommand('pip install package').intent).toBe('write');
      });
    });

    describe('exact-only (dangerous) commands', () => {
      it('should classify destructive commands correctly', () => {
        expect(classifyCommand('rm -rf /').intent).toBe('destructive');
        expect(classifyCommand('rmdir folder').intent).toBe('destructive');
      });

      it('should classify network commands correctly', () => {
        expect(classifyCommand('curl https://example.com').intent).toBe(
          'network',
        );
        expect(classifyCommand('wget file.zip').intent).toBe('network');
        expect(classifyCommand('ssh user@host').intent).toBe('network');
      });

      it('should classify system admin commands correctly', () => {
        expect(classifyCommand('sudo apt update').intent).toBe('system-admin');
        expect(classifyCommand('su - root').intent).toBe('system-admin');
      });
    });

    describe('unknown commands', () => {
      it('should classify unknown commands as unknown', () => {
        expect(classifyCommand('myCustomScript').intent).toBe('unknown');
        expect(classifyCommand('some-random-binary').intent).toBe('unknown');
      });
    });
  });

  describe('shouldPersist', () => {
    it('should return true for read-only commands', () => {
      expect(shouldPersist('ls -la')).toBe(true);
      expect(shouldPersist('cat file.txt')).toBe(true);
      expect(shouldPersist('git status')).toBe(true);
      expect(shouldPersist('pwd')).toBe(true);
    });

    it('should return false for write commands', () => {
      expect(shouldPersist('git commit -m "msg"')).toBe(false);
      expect(shouldPersist('npm install')).toBe(false);
    });

    it('should return false for dangerous commands', () => {
      expect(shouldPersist('rm -rf /')).toBe(false);
      expect(shouldPersist('curl https://evil.com')).toBe(false);
      expect(shouldPersist('sudo rm -rf /')).toBe(false);
    });

    it('should return false for unknown commands', () => {
      expect(shouldPersist('my-custom-script')).toBe(false);
    });
  });

  describe('isExactOnly', () => {
    it('should return true for dangerous commands', () => {
      expect(isExactOnly('rm file.txt')).toBe(true);
      expect(isExactOnly('curl https://api.com')).toBe(true);
      expect(isExactOnly('ssh user@host')).toBe(true);
      expect(isExactOnly('sudo apt update')).toBe(true);
      expect(isExactOnly('bash script.sh')).toBe(true);
    });

    it('should return false for safe commands', () => {
      expect(isExactOnly('ls -la')).toBe(false);
      expect(isExactOnly('git status')).toBe(false);
      expect(isExactOnly('cat file.txt')).toBe(false);
      expect(isExactOnly('npm run test')).toBe(false);
    });
  });

  describe('generateScopeOptions', () => {
    it('should always include exact scope option', () => {
      const options = generateScopeOptions('ls -la', 'ls');
      expect(options.some((o) => o.id === 'exact')).toBe(true);
    });

    it('should only return exact for dangerous commands', () => {
      const options = generateScopeOptions('rm -rf /', 'rm');
      expect(options).toHaveLength(1);
      expect(options[0].id).toBe('exact');
    });

    it('should return multiple options for safe commands', () => {
      const options = generateScopeOptions('ls -la', 'ls');
      expect(options.length).toBeGreaterThan(1);
      expect(options.some((o) => o.id === 'command-only')).toBe(true);
    });

    it('should include command-flags option when flags are present', () => {
      const options = generateScopeOptions('ls -la /tmp', 'ls -la');
      const flagOption = options.find((o) => o.id === 'command-flags');
      expect(flagOption).toBeDefined();
      expect(flagOption?.label).toContain('ls -la');
    });

    it('should mark read-only command-only scope as recommended', () => {
      const options = generateScopeOptions('ls -la', 'ls');
      const commandOnly = options.find((o) => o.id === 'command-only');
      expect(commandOnly?.recommended).toBe(true);
    });

    it('should not mark write command-only scope as recommended', () => {
      const options = generateScopeOptions('git commit -m "test"', 'git');
      const commandOnly = options.find((o) => o.id === 'command-only');
      expect(commandOnly?.recommended).toBeFalsy();
    });
  });

  describe('getRecommendedScope', () => {
    it('should return exact for dangerous commands', () => {
      expect(getRecommendedScope('rm -rf /')).toBe('exact');
      expect(getRecommendedScope('curl https://api.com')).toBe('exact');
      expect(getRecommendedScope('sudo apt update')).toBe('exact');
    });

    it('should return command-only for read-only commands', () => {
      expect(getRecommendedScope('ls -la')).toBe('command-only');
      expect(getRecommendedScope('cat file.txt')).toBe('command-only');
      expect(getRecommendedScope('git status')).toBe('command-only');
    });

    it('should return command-flags for write commands with flags', () => {
      expect(getRecommendedScope('git commit -m "test"')).toBe('command-flags');
      expect(getRecommendedScope('npm run -s test')).toBe('command-flags');
    });

    it('should return exact for write commands without flags', () => {
      expect(getRecommendedScope('npm install')).toBe('exact');
    });

    it('should return exact for unknown commands', () => {
      expect(getRecommendedScope('my-custom-script')).toBe('exact');
    });
  });
});
