/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import type {
  SerializableConfirmationDetails,
  Config,
} from '@google/gemini-cli-core';
import { initializeShellParsers } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';

describe('ToolConfirmationMessage Redirection', () => {
  beforeAll(async () => {
    await initializeShellParsers();
  });

  const mockConfig = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
  } as unknown as Config;

  it('should display redirection warning and tip for redirected commands', () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: 'echo "hello" > test.txt',
      rootCommand: 'echo, redirection (>)',
      rootCommands: ['echo'],
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        availableTerminalHeight={30}
        terminalWidth={100}
      />,
    );

    const output = lastFrame();
    expect(output).toMatchSnapshot();
  });
});
