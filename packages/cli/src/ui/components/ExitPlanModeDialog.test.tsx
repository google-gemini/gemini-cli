/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { ExitPlanModeDialog } from './ExitPlanModeDialog.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import {
  ApprovalMode,
  validatePlanContent,
  processSingleFileContent,
  type FileSystemService,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    validatePlanPath: vi.fn(async () => null),
    validatePlanContent: vi.fn(async () => null),
    processSingleFileContent: vi.fn(),
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    existsSync: vi.fn(),
    realpathSync: vi.fn((p) => p),
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
  };
});

const writeKey = (stdin: { write: (data: string) => void }, key: string) => {
  act(() => {
    stdin.write(key);
  });
  // Advance timers to simulate time passing between keystrokes.
  // This avoids bufferFastReturn converting Enter to Shift+Enter.
  if (vi.isFakeTimers()) {
    act(() => {
      vi.advanceTimersByTime(50);
    });
  }
};

describe('ExitPlanModeDialog', () => {
  const mockTargetDir = '/mock/project';
  const mockPlansDir = '/mock/project/plans';
  const mockPlanFullPath = '/mock/project/plans/test-plan.md';

  const samplePlanContent = `## Overview

Add user authentication to the CLI application.

## Implementation Steps

1. Create \`src/auth/AuthService.ts\` with login/logout methods
2. Add session storage in \`src/storage/SessionStore.ts\`
3. Update \`src/commands/index.ts\` to check auth status
4. Add tests in \`src/auth/__tests__/\`

## Files to Modify

- \`src/index.ts\` - Add auth middleware
- \`src/config.ts\` - Add auth configuration options`;

  const longPlanContent = `## Overview

Implement a comprehensive authentication system with multiple providers.

## Implementation Steps

1. Create \`src/auth/AuthService.ts\` with login/logout methods
2. Add session storage in \`src/storage/SessionStore.ts\`
3. Update \`src/commands/index.ts\` to check auth status
4. Add OAuth2 provider support in \`src/auth/providers/OAuth2Provider.ts\`
5. Add SAML provider support in \`src/auth/providers/SAMLProvider.ts\`
6. Add LDAP provider support in \`src/auth/providers/LDAPProvider.ts\`
7. Create token refresh mechanism in \`src/auth/TokenManager.ts\`
8. Add multi-factor authentication in \`src/auth/MFAService.ts\`
9. Implement session timeout handling in \`src/auth/SessionManager.ts\`
10. Add audit logging for auth events in \`src/auth/AuditLogger.ts\`
11. Create user profile management in \`src/auth/UserProfile.ts\`
12. Add role-based access control in \`src/auth/RBACService.ts\`
13. Implement password policy enforcement in \`src/auth/PasswordPolicy.ts\`
14. Add brute force protection in \`src/auth/BruteForceGuard.ts\`
15. Create secure cookie handling in \`src/auth/CookieManager.ts\`

## Files to Modify

- \`src/index.ts\` - Add auth middleware
- \`src/config.ts\` - Add auth configuration options
- \`src/routes/api.ts\` - Add auth endpoints
- \`src/middleware/cors.ts\` - Update CORS for auth headers
- \`src/utils/crypto.ts\` - Add encryption utilities

## Testing Strategy

- Unit tests for each auth provider
- Integration tests for full auth flows
- Security penetration testing
- Load testing for session management`;

  let onApprove: ReturnType<typeof vi.fn>;
  let onFeedback: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(processSingleFileContent).mockResolvedValue({
      llmContent: samplePlanContent,
      returnDisplay: 'Read file',
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p as string);
    onApprove = vi.fn();
    onFeedback = vi.fn();
    onCancel = vi.fn();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderDialog = (options?: { useAlternateBuffer?: boolean }) =>
    renderWithProviders(
      <ExitPlanModeDialog
        planPath={mockPlanFullPath}
        onApprove={onApprove}
        onFeedback={onFeedback}
        onCancel={onCancel}
        width={80}
        availableHeight={24}
      />,
      {
        ...options,
        config: {
          getTargetDir: () => mockTargetDir,
          getIdeMode: () => false,
          isTrustedFolder: () => true,
          storage: {
            getPlansDir: () => mockPlansDir,
          },
          getFileSystemService: (): FileSystemService => ({
            readTextFile: vi.fn(),
            writeTextFile: vi.fn(),
          }),
        } as unknown as import('@google/gemini-cli-core').Config,
      },
    );

  describe.each([{ useAlternateBuffer: true }, { useAlternateBuffer: false }])(
    'useAlternateBuffer: $useAlternateBuffer',
    ({ useAlternateBuffer }) => {
      it('renders correctly with plan content', async () => {
        const { lastFrame } = renderDialog({ useAlternateBuffer });

        // Advance timers to pass the debounce period
        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain('Add user authentication');
        });

        await waitFor(() => {
          expect(processSingleFileContent).toHaveBeenCalledWith(
            mockPlanFullPath,
            mockPlansDir,
            expect.anything(),
          );
        });

        expect(lastFrame()).toMatchSnapshot();
      });

      it('calls onApprove with AUTO_EDIT when first option is selected', async () => {
        const { stdin, lastFrame } = renderDialog({ useAlternateBuffer });

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain('Add user authentication');
        });

        writeKey(stdin, '\r');

        await waitFor(() => {
          expect(onApprove).toHaveBeenCalledWith(ApprovalMode.AUTO_EDIT);
        });
      });

      it('calls onApprove with DEFAULT when second option is selected', async () => {
        const { stdin, lastFrame } = renderDialog({ useAlternateBuffer });

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain('Add user authentication');
        });

        writeKey(stdin, '\x1b[B'); // Down arrow
        writeKey(stdin, '\r');

        await waitFor(() => {
          expect(onApprove).toHaveBeenCalledWith(ApprovalMode.DEFAULT);
        });
      });

      it('calls onFeedback when feedback is typed and submitted', async () => {
        const { stdin, lastFrame } = renderDialog({ useAlternateBuffer });

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain('Add user authentication');
        });

        // Navigate to feedback option
        writeKey(stdin, '\x1b[B'); // Down arrow
        writeKey(stdin, '\x1b[B'); // Down arrow

        // Type feedback
        for (const char of 'Add tests') {
          writeKey(stdin, char);
        }

        await waitFor(() => {
          expect(lastFrame()).toMatchSnapshot();
        });

        writeKey(stdin, '\r');

        await waitFor(() => {
          expect(onFeedback).toHaveBeenCalledWith('Add tests');
        });
      });

      it('calls onCancel when Esc is pressed', async () => {
        const { stdin, lastFrame } = renderDialog({ useAlternateBuffer });

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain('Add user authentication');
        });

        writeKey(stdin, '\x1b'); // Escape

        await act(async () => {
          vi.runAllTimers();
        });

        expect(onCancel).toHaveBeenCalled();
      });

      it('displays error state when file read fails', async () => {
        vi.mocked(processSingleFileContent).mockResolvedValue({
          llmContent: '',
          returnDisplay: '',
          error: 'File not found',
        });

        const { lastFrame } = renderDialog({ useAlternateBuffer });

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain('Error reading plan: File not found');
        });

        expect(lastFrame()).toMatchSnapshot();
      });

      it('displays error state when plan file is empty', async () => {
        vi.mocked(validatePlanContent).mockResolvedValue('Plan file is empty.');

        const { lastFrame } = renderDialog({ useAlternateBuffer });

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain(
            'Error reading plan: Plan file is empty.',
          );
        });
      });

      it('handles long plan content appropriately', async () => {
        vi.mocked(processSingleFileContent).mockResolvedValue({
          llmContent: longPlanContent,
          returnDisplay: 'Read file',
        });

        const { lastFrame } = renderDialog({ useAlternateBuffer });

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain(
            'Implement a comprehensive authentication system',
          );
        });

        expect(lastFrame()).toMatchSnapshot();
      });

      it('allows number key quick selection', async () => {
        const { stdin, lastFrame } = renderDialog({ useAlternateBuffer });

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain('Add user authentication');
        });

        // Press '2' to select second option directly
        writeKey(stdin, '2');

        await waitFor(() => {
          expect(onApprove).toHaveBeenCalledWith(ApprovalMode.DEFAULT);
        });
      });

      it('clears feedback text when Ctrl+C is pressed while editing', async () => {
        const { stdin, lastFrame } = renderDialog({ useAlternateBuffer });

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain('Add user authentication');
        });

        // Navigate to feedback option and start typing
        writeKey(stdin, '\x1b[B'); // Down arrow
        writeKey(stdin, '\x1b[B'); // Down arrow
        writeKey(stdin, '\r'); // Select to focus input

        // Type some feedback
        for (const char of 'test feedback') {
          writeKey(stdin, char);
        }

        await waitFor(() => {
          expect(lastFrame()).toContain('test feedback');
        });

        // Press Ctrl+C to clear
        writeKey(stdin, '\x03'); // Ctrl+C

        await waitFor(() => {
          expect(lastFrame()).not.toContain('test feedback');
          expect(lastFrame()).toContain('Type your feedback...');
        });

        // Dialog should still be open (not cancelled)
        expect(onCancel).not.toHaveBeenCalled();
      });

      it('bubbles up Ctrl+C when feedback is empty while editing', async () => {
        const onBubbledQuit = vi.fn();

        const BubbleListener = ({
          children,
        }: {
          children: React.ReactNode;
        }) => {
          useKeypress(
            (key) => {
              if (keyMatchers[Command.QUIT](key)) {
                onBubbledQuit();
              }
              return false;
            },
            { isActive: true },
          );
          return <>{children}</>;
        };

        const { stdin, lastFrame } = renderWithProviders(
          <BubbleListener>
            <ExitPlanModeDialog
              planPath={mockPlanFullPath}
              onApprove={onApprove}
              onFeedback={onFeedback}
              onCancel={onCancel}
              width={80}
              availableHeight={24}
            />
          </BubbleListener>,
          {
            useAlternateBuffer,
            config: {
              getTargetDir: () => mockTargetDir,
              getIdeMode: () => false,
              isTrustedFolder: () => true,
              storage: {
                getPlansDir: () => mockPlansDir,
              },
              getFileSystemService: (): FileSystemService => ({
                readTextFile: vi.fn(),
                writeTextFile: vi.fn(),
              }),
            } as unknown as import('@google/gemini-cli-core').Config,
          },
        );

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain('Add user authentication');
        });

        // Navigate to feedback option
        writeKey(stdin, '\x1b[B'); // Down arrow
        writeKey(stdin, '\x1b[B'); // Down arrow

        // Type some feedback
        for (const char of 'test') {
          writeKey(stdin, char);
        }

        await waitFor(() => {
          expect(lastFrame()).toContain('test');
        });

        // First Ctrl+C to clear text
        writeKey(stdin, '\x03'); // Ctrl+C

        await waitFor(() => {
          expect(lastFrame()).toMatchSnapshot();
        });
        expect(onBubbledQuit).not.toHaveBeenCalled();

        // Second Ctrl+C to exit (should bubble)
        writeKey(stdin, '\x03'); // Ctrl+C

        await waitFor(() => {
          expect(onBubbledQuit).toHaveBeenCalled();
        });
        expect(onCancel).not.toHaveBeenCalled();
      });

      it('does not submit empty feedback when Enter is pressed', async () => {
        const { stdin, lastFrame } = renderDialog({ useAlternateBuffer });

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain('Add user authentication');
        });

        // Navigate to feedback option
        writeKey(stdin, '\x1b[B'); // Down arrow
        writeKey(stdin, '\x1b[B'); // Down arrow

        // Press Enter without typing anything
        writeKey(stdin, '\r');

        // Wait a bit to ensure no callback was triggered
        await act(async () => {
          vi.advanceTimersByTime(50);
        });

        expect(onFeedback).not.toHaveBeenCalled();
        expect(onApprove).not.toHaveBeenCalled();
      });

      it('allows arrow navigation while typing feedback to change selection', async () => {
        const { stdin, lastFrame } = renderDialog({ useAlternateBuffer });

        await act(async () => {
          vi.runAllTimers();
        });

        await waitFor(() => {
          expect(lastFrame()).toContain('Add user authentication');
        });

        // Navigate to feedback option and start typing
        writeKey(stdin, '\x1b[B'); // Down arrow
        writeKey(stdin, '\x1b[B'); // Down arrow

        // Type some feedback
        for (const char of 'test') {
          writeKey(stdin, char);
        }

        // Now use up arrow to navigate back to a different option
        writeKey(stdin, '\x1b[A'); // Up arrow

        // Press Enter to select the second option (manually accept edits)
        writeKey(stdin, '\r');

        await waitFor(() => {
          expect(onApprove).toHaveBeenCalledWith(ApprovalMode.DEFAULT);
        });
        expect(onFeedback).not.toHaveBeenCalled();
      });
    },
  );
});
