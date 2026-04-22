/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import type { SerializableConfirmationDetails , Config} from '@google/gemini-cli-core';
import { initializeShellParsers } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../../test-utils/render.js';
import { createMockSettings } from '../../../test-utils/settings.js';

describe('ToolConfirmationMessage Redirection', () => {
  beforeAll(async () => {
    await initializeShellParsers();
  });

  it('should display redirection warning and tip for redirected commands', async () => {
    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'exec',
      title: 'Confirm execution',
      command: 'echo "hello" > test.txt',
      rootCommand: 'echo',
      rootCommands: ['echo'],
    };

    const mockConfig = {
      isTrustedFolder: () => true,
      getIdeMode: () => false,
      getDisableAlwaysAllow: () => false,
      getApprovalMode: () => 'default',
    } as unknown as Config;

    const { lastFrame, unmount } = await renderWithProviders(
      <ToolConfirmationMessage
        callId="test-call-id"
        confirmationDetails={confirmationDetails}
        config={mockConfig}
        getPreferredEditor={vi.fn()}
        availableTerminalHeight={30}
        terminalWidth={100}
        toolName="shell"
      />,
      {
        settings: createMockSettings({
          security: { enablePermanentToolApproval: false },
        }),
      },
    );

    const output = lastFrame();
    expect(output).toMatchSnapshot();
    unmount();
  });
});
