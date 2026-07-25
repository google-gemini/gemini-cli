/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import { getPendingAttentionNotification } from './pendingAttentionNotification.js';

describe('getPendingAttentionNotification', () => {
  it('returns tool confirmation notification for awaiting tool approvals', () => {
    const notification = getPendingAttentionNotification(
      [
        {
          type: 'tool_group',
          tools: [
            {
              callId: 'tool-1',
              status: CoreToolCallStatus.AwaitingApproval,
              description: 'Run command',
              confirmationDetails: {
                type: 'exec',
                title: 'Run shell command',
                command: 'ls',
                rootCommand: 'ls',
                rootCommands: ['ls'],
              },
            },
          ],
        } as never,
      ],
      null,
      null,
      null,
      false,
      false,
    );

    expect(notification?.key).toBe('tool_confirmation:tool-1');
    expect(notification?.event.type).toBe('attention');
  });

  it('returns ask-user notification for ask_user confirmations', () => {
    const notification = getPendingAttentionNotification(
      [
        {
          type: 'tool_group',
          tools: [
            {
              callId: 'ask-user-1',
              status: CoreToolCallStatus.AwaitingApproval,
              description: 'Ask user',
              confirmationDetails: {
                type: 'ask_user',
                questions: [
                  {
                    header: 'Need approval?',
                    question: 'Proceed?',
                    options: [],
                    id: 'q1',
                  },
                ],
              },
            },
          ],
        } as never,
      ],
      null,
      null,
      null,
      false,
      false,
    );

    expect(notification?.key).toBe('ask_user:ask-user-1');
    expect(notification?.event).toEqual({
      type: 'attention',
      heading: 'Answer requested by agent',
      detail: 'Need approval?',
    });
  });

  it('uses request content in command/auth keys', () => {
    const commandNotification = getPendingAttentionNotification(
      [],
      {
        prompt: 'Approve command?',
        onConfirm: () => {},
      },
      null,
      null,
      false,
      false,
    );

    const authNotification = getPendingAttentionNotification(
      [],
      null,
      {
        prompt: 'Authorize sign-in?',
        onConfirm: () => {},
      },
      null,
      false,
      false,
    );

    expect(commandNotification?.key).toContain('command_confirmation:');
    expect(commandNotification?.key).toContain('Approve command?');
    expect(authNotification?.key).toContain('auth_consent:');
    expect(authNotification?.key).toContain('Authorize sign-in?');
  });
});
