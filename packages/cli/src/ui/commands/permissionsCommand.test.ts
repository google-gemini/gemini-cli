/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { permissionsCommand } from './permissionsCommand.js';
import { type CommandContext, CommandKind } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('permissionsCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should have the correct name and description', () => {
    expect(permissionsCommand.name).toBe('permissions');
    expect(permissionsCommand.description).toBe('Manage folder trust settings');
  });

  it('should be a built-in command', () => {
    expect(permissionsCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should return an action to open the permissions dialog if folder trust is enabled', () => {
    mockContext.services.settings.merged.security = {
      folderTrust: { enabled: true },
    };
    const actionResult = permissionsCommand.action?.(mockContext, '');
    expect(actionResult).toEqual({
      type: 'dialog',
      dialog: 'permissions',
    });
  });

  it('should return a message if folder trust is disabled', () => {
    mockContext.services.settings.merged.security = {
      folderTrust: { enabled: false },
    };
    const actionResult = permissionsCommand.action?.(mockContext, '');
    expect(actionResult).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Folder trust is disabled. You can enable it in the settings.',
    });
  });
});
