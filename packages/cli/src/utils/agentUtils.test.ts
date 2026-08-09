/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/settings.js', () => ({
  SettingScope: {
    User: 'User',
    Workspace: 'Workspace',
    System: 'System',
    SystemDefaults: 'SystemDefaults',
  },
}));

import { renderAgentActionFeedback } from './agentUtils.js';
import { SettingScope } from '../config/settings.js';
import type { AgentActionResult } from './agentSettings.js';

describe('agentUtils', () => {
  describe('renderAgentActionFeedback', () => {
    const mockFormatScope = (label: string, path: string) =>
      `[${label}:${path}]`;

    it('should return error message if status is error', () => {
      const result: AgentActionResult = {
        status: 'error',
        agentName: 'my-agent',
        action: 'enable',
        modifiedScopes: [],
        alreadyInStateScopes: [],
        error: 'Something went wrong',
      };
      expect(renderAgentActionFeedback(result, mockFormatScope)).toBe(
        'Something went wrong',
      );
    });

    it('should return default error message if status is error and no error message provided', () => {
      const result: AgentActionResult = {
        status: 'error',
        agentName: 'my-agent',
        action: 'enable',
        modifiedScopes: [],
        alreadyInStateScopes: [],
      };
      expect(renderAgentActionFeedback(result, mockFormatScope)).toBe(
        'An error occurred while attempting to enable agent "my-agent".',
      );
    });

    it('should return no-op message for enable', () => {
      const result: AgentActionResult = {
        status: 'no-op',
        agentName: 'my-agent',
        action: 'enable',
        modifiedScopes: [],
        alreadyInStateScopes: [],
      };
      expect(renderAgentActionFeedback(result, mockFormatScope)).toBe(
        'Agent "my-agent" is already enabled.',
      );
    });

    it('should return no-op message for disable', () => {
      const result: AgentActionResult = {
        status: 'no-op',
        agentName: 'my-agent',
        action: 'disable',
        modifiedScopes: [],
        alreadyInStateScopes: [],
      };
      expect(renderAgentActionFeedback(result, mockFormatScope)).toBe(
        'Agent "my-agent" is already disabled.',
      );
    });

    it('should return success message for enable (single scope)', () => {
      const result: AgentActionResult = {
        status: 'success',
        agentName: 'my-agent',
        action: 'enable',
        modifiedScopes: [
          { scope: SettingScope.User, path: '/path/to/user/settings' },
        ],
        alreadyInStateScopes: [],
      };
      expect(renderAgentActionFeedback(result, mockFormatScope)).toBe(
        'Agent "my-agent" enabled by setting it to enabled in [user:/path/to/user/settings] settings.',
      );
    });

    it('should return success message for enable (two scopes)', () => {
      const result: AgentActionResult = {
        status: 'success',
        agentName: 'my-agent',
        action: 'enable',
        modifiedScopes: [
          { scope: SettingScope.User, path: '/path/to/user/settings' },
        ],
        alreadyInStateScopes: [
          {
            scope: SettingScope.Workspace,
            path: '/path/to/workspace/settings',
          },
        ],
      };
      expect(renderAgentActionFeedback(result, mockFormatScope)).toBe(
        'Agent "my-agent" enabled by setting it to enabled in [user:/path/to/user/settings] and [project:/path/to/workspace/settings] settings.',
      );
    });

    it('should return success message for disable (single scope)', () => {
      const result: AgentActionResult = {
        status: 'success',
        agentName: 'my-agent',
        action: 'disable',
        modifiedScopes: [
          { scope: SettingScope.User, path: '/path/to/user/settings' },
        ],
        alreadyInStateScopes: [],
      };
      expect(renderAgentActionFeedback(result, mockFormatScope)).toBe(
        'Agent "my-agent" disabled by setting it to disabled in [user:/path/to/user/settings] settings.',
      );
    });

    it('should return success message for disable (two scopes)', () => {
      const result: AgentActionResult = {
        status: 'success',
        agentName: 'my-agent',
        action: 'disable',
        modifiedScopes: [
          { scope: SettingScope.User, path: '/path/to/user/settings' },
        ],
        alreadyInStateScopes: [
          {
            scope: SettingScope.Workspace,
            path: '/path/to/workspace/settings',
          },
        ],
      };
      expect(renderAgentActionFeedback(result, mockFormatScope)).toBe(
        'Agent "my-agent" is now disabled in both [user:/path/to/user/settings] and [project:/path/to/workspace/settings] settings.',
      );
    });
  });
});
