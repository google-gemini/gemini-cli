/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { TrustedHooksManager } from './trustedHooks.js';
import { Storage } from '../config/storage.js';
import { HookEventName, HookType } from './types.js';

vi.mock('node:fs');
vi.mock('../config/storage.js');
vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('TrustedHooksManager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(Storage.getGlobalGeminiDir).mockReturnValue('/mock/home/.gemini');
  });

  describe('initialization', () => {
    it('should load existing trusted hooks', () => {
      const existingData = {
        '/project/a': ['hook1:cmd1'],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingData));

      const manager = new TrustedHooksManager();
      const untrusted = manager.getUntrustedHooks('/project/a', {
        [HookEventName.BeforeTool]: [
          {
            hooks: [{ type: HookType.Command, command: 'cmd1', name: 'hook1' }],
          },
        ],
      });

      expect(untrusted).toHaveLength(0);
    });

    it('should handle missing config file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const manager = new TrustedHooksManager();
      const untrusted = manager.getUntrustedHooks('/project/a', {
        [HookEventName.BeforeTool]: [
          {
            hooks: [{ type: HookType.Command, command: 'cmd1', name: 'hook1' }],
          },
        ],
      });

      expect(untrusted).toEqual(['hook1']);
    });
  });

  describe('getUntrustedHooks', () => {
    it('should return names of untrusted hooks', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const manager = new TrustedHooksManager();

      const projectHooks = {
        [HookEventName.BeforeTool]: [
          {
            hooks: [
              { name: 'trusted-hook', type: HookType.Command, command: 'cmd1' },
              { name: 'new-hook', type: HookType.Command, command: 'cmd2' },
            ],
          },
        ],
      };

      // Initially both are untrusted
      expect(manager.getUntrustedHooks('/project', projectHooks)).toEqual([
        'trusted-hook',
        'new-hook',
      ]);

      // Trust one
      manager.trustHooks('/project', {
        [HookEventName.BeforeTool]: [
          {
            hooks: [
              { name: 'trusted-hook', type: HookType.Command, command: 'cmd1' },
            ],
          },
        ],
      });

      // Only the other one is untrusted
      expect(manager.getUntrustedHooks('/project', projectHooks)).toEqual([
        'new-hook',
      ]);
    });

    it('should use command if name is missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const manager = new TrustedHooksManager();

      const projectHooks = {
        [HookEventName.BeforeTool]: [
          {
            hooks: [{ type: HookType.Command, command: './script.sh' }],
          },
        ],
      };

      expect(manager.getUntrustedHooks('/project', projectHooks)).toEqual([
        './script.sh',
      ]);
    });

    it('should detect change in command as untrusted', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const manager = new TrustedHooksManager();

      const originalHook = {
        [HookEventName.BeforeTool]: [
          {
            hooks: [
              { name: 'my-hook', type: HookType.Command, command: 'old-cmd' },
            ],
          },
        ],
      };
      const updatedHook = {
        [HookEventName.BeforeTool]: [
          {
            hooks: [
              { name: 'my-hook', type: HookType.Command, command: 'new-cmd' },
            ],
          },
        ],
      };

      manager.trustHooks('/project', originalHook);

      expect(manager.getUntrustedHooks('/project', updatedHook)).toEqual([
        'my-hook',
      ]);
    });
  });

  describe('persistence', () => {
    it('should save to file when trusting hooks', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const manager = new TrustedHooksManager();

      manager.trustHooks('/project', {
        [HookEventName.BeforeTool]: [
          {
            hooks: [{ name: 'hook1', type: HookType.Command, command: 'cmd1' }],
          },
        ],
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('trusted_hooks.json'),
        expect.stringContaining('hook1:cmd1'),
      );
    });

    it('should create directory if missing on save', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const manager = new TrustedHooksManager();

      manager.trustHooks('/project', {});

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), {
        recursive: true,
      });
    });
  });
});
