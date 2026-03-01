/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderHookActionFeedback } from './hookUtils.js';
import type { HookActionResult } from './hookSettings.js';
import { SettingScope } from '../config/settings.js';

describe('hookUtils', () => {
  describe('renderHookActionFeedback', () => {
    const mockFormatScope = (label: string, path: string) =>
      `${label} (${path})`;

    it('should render error message', () => {
      const result: HookActionResult = {
        status: 'error',
        hookName: 'test-hook',
        action: 'enable',
        modifiedScopes: [],
        alreadyInStateScopes: [],
        error: 'Something went wrong',
      };

      const message = renderHookActionFeedback(result, mockFormatScope);
      expect(message).toBe('Something went wrong');
    });

    it('should render default error message if error string is missing', () => {
      const result: HookActionResult = {
        status: 'error',
        hookName: 'test-hook',
        action: 'enable',
        modifiedScopes: [],
        alreadyInStateScopes: [],
      };

      const message = renderHookActionFeedback(result, mockFormatScope);
      expect(message).toBe(
        'An error occurred while attempting to enable hook "test-hook".',
      );
    });

    it('should render no-op message for enable', () => {
      const result: HookActionResult = {
        status: 'no-op',
        hookName: 'test-hook',
        action: 'enable',
        modifiedScopes: [],
        alreadyInStateScopes: [],
      };

      const message = renderHookActionFeedback(result, mockFormatScope);
      expect(message).toBe('Hook "test-hook" is already enabled.');
    });

    it('should render no-op message for disable', () => {
      const result: HookActionResult = {
        status: 'no-op',
        hookName: 'test-hook',
        action: 'disable',
        modifiedScopes: [],
        alreadyInStateScopes: [],
      };

      const message = renderHookActionFeedback(result, mockFormatScope);
      expect(message).toBe('Hook "test-hook" is already disabled.');
    });

    it('should render success message for enable (single scope)', () => {
      const result: HookActionResult = {
        status: 'success',
        hookName: 'test-hook',
        action: 'enable',
        modifiedScopes: [{ scope: SettingScope.User, path: '/path/user.json' }],
        alreadyInStateScopes: [
          { scope: SettingScope.Workspace, path: '/path/workspace.json' },
        ],
      };

      const message = renderHookActionFeedback(result, mockFormatScope);
      expect(message).toBe(
        'Hook "test-hook" enabled by removing it from the disabled list in user (/path/user.json) and workspace (/path/workspace.json) settings.',
      );
    });

    it('should render success message for enable (single scope only affected)', () => {
      // E.g. Workspace doesn't exist or isn't loadable, so only User is affected.
      const result: HookActionResult = {
        status: 'success',
        hookName: 'test-hook',
        action: 'enable',
        modifiedScopes: [{ scope: SettingScope.User, path: '/path/user.json' }],
        alreadyInStateScopes: [],
      };

      const message = renderHookActionFeedback(result, mockFormatScope);
      expect(message).toBe(
        'Hook "test-hook" enabled by removing it from the disabled list in user (/path/user.json) settings.',
      );
    });

    it('should render success message for disable (single scope)', () => {
      const result: HookActionResult = {
        status: 'success',
        hookName: 'test-hook',
        action: 'disable',
        modifiedScopes: [
          { scope: SettingScope.Workspace, path: '/path/workspace.json' },
        ],
        alreadyInStateScopes: [],
      };

      const message = renderHookActionFeedback(result, mockFormatScope);
      expect(message).toBe(
        'Hook "test-hook" disabled by adding it to the disabled list in workspace (/path/workspace.json) settings.',
      );
    });

    it('should render success message for disable (two scopes)', () => {
      // E.g. Disabled in Workspace, but ALREADY disabled in User.
      const result: HookActionResult = {
        status: 'success',
        hookName: 'test-hook',
        action: 'disable',
        modifiedScopes: [
          { scope: SettingScope.Workspace, path: '/path/workspace.json' },
        ],
        alreadyInStateScopes: [
          { scope: SettingScope.User, path: '/path/user.json' },
        ],
      };

      const message = renderHookActionFeedback(result, mockFormatScope);
      expect(message).toBe(
        'Hook "test-hook" is now disabled in both workspace (/path/workspace.json) and user (/path/user.json) settings.',
      );
    });
  });
});
