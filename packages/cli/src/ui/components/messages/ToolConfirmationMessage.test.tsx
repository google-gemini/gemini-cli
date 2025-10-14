/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

import { render } from 'ink-testing-library';

import {
  ToolConfirmationMessage,
  type ToolConfirmationMessageProps,
} from './ToolConfirmationMessage.js';

import {
  type Config,
  type ToolCallConfirmationDetails,
} from '@google/gemini-cli-core';

import { KeypressProvider } from '../../contexts/KeypressContext.js';

describe('ToolConfirmationMessage', () => {
  let lastFrame: () => string;

  const mockOnConfirm = vi.fn();

  const baseDetails: Omit<ToolCallConfirmationDetails, 'type'> = {
    onConfirm: mockOnConfirm,

    title: 'Confirm Tool Call',
  };

  const execDetails: ToolCallConfirmationDetails = {
    ...baseDetails,

    type: 'exec',

    command: 'echo "hello"',

    rootCommand: 'echo',
  };

  const editDetails: ToolCallConfirmationDetails = {
    ...baseDetails,

    type: 'edit',

    fileDiff:
      'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt',

    fileName: 'file.txt',

    filePath: '/path/to/file.txt',

    isModifying: false,

    originalContent: 'a',

    newContent: 'b',
  };

  const infoDetails: ToolCallConfirmationDetails = {
    ...baseDetails,

    type: 'info',

    prompt: 'Fetch data from example.com',

    urls: ['https://example.com'],
  };

  const mcpDetails: ToolCallConfirmationDetails = {
    ...baseDetails,

    type: 'mcp',

    serverName: 'test-server',

    toolName: 'test-tool',

    toolDisplayName: 'Test Tool',
  };

  const mockConfig = (isTrusted: boolean): Config =>
    ({
      isTrustedFolder: () => isTrusted,

      getIdeMode: () => false,

      getShellCommandsWithSubcommands: () => ['npm', 'git'],
    }) as unknown as Config;

  const renderComponent = (
    props: Omit<ToolConfirmationMessageProps, 'terminalWidth'>,
  ) => {
    const { lastFrame: lf } = render(
      <KeypressProvider kittyProtocolEnabled={false}>
        <ToolConfirmationMessage {...props} terminalWidth={80} />
      </KeypressProvider>,
    );

    lastFrame = () => lf() || '';
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('with trusted folder', () => {
    const config = mockConfig(true);

    it('for exec confirmations, should show all "always allow" options', () => {
      renderComponent({ confirmationDetails: execDetails, config });
      expect(lastFrame()).toContain('Yes, always allow this exact command');
      expect(lastFrame()).toContain('Yes, always allow commands starting with');
    });

    it('for edit confirmations, should not show "always allow"', () => {
      renderComponent({ confirmationDetails: editDetails, config });
      expect(lastFrame()).not.toContain('Yes, allow always');
    });

    it('for info confirmations, should not show "always allow"', () => {
      renderComponent({ confirmationDetails: infoDetails, config });
      expect(lastFrame()).not.toContain('Yes, allow always');
    });

    it('for mcp confirmations, should show all "always allow" options', () => {
      renderComponent({ confirmationDetails: mcpDetails, config });
      expect(lastFrame()).toContain('Yes, always allow tool "test-tool"');
      expect(lastFrame()).toContain('Yes, always allow all tools from server');
    });
  });

  describe('with untrusted folder', () => {
    const config = mockConfig(false);

    it('for exec confirmations, should NOT show "always allow" options', () => {
      renderComponent({ confirmationDetails: execDetails, config });
      expect(lastFrame()).not.toContain('Yes, always allow');
    });

    it('for edit confirmations, should NOT show "always allow"', () => {
      renderComponent({ confirmationDetails: editDetails, config });
      expect(lastFrame()).not.toContain('Yes, allow always');
    });

    it('for info confirmations, should NOT show "always allow"', () => {
      renderComponent({ confirmationDetails: infoDetails, config });
      expect(lastFrame()).not.toContain('Yes, allow always');
    });

    it('for mcp confirmations, should NOT show "always allow" options', () => {
      renderComponent({ confirmationDetails: mcpDetails, config });
      expect(lastFrame()).not.toContain('Yes, always allow');
    });
  });
});
