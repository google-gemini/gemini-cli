/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config, InboxSkill } from '@google/gemini-cli-core';
import {
  dismissInboxSkill,
  listInboxSkills,
  moveInboxSkill,
} from '@google/gemini-cli-core';
import { waitFor } from '../../test-utils/async.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { SkillInboxDialog } from './SkillInboxDialog.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  return {
    ...original,
    dismissInboxSkill: vi.fn(),
    listInboxSkills: vi.fn(),
    moveInboxSkill: vi.fn(),
    getErrorMessage: vi.fn((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    ),
  };
});

const mockListInboxSkills = vi.mocked(listInboxSkills);
const mockMoveInboxSkill = vi.mocked(moveInboxSkill);
const mockDismissInboxSkill = vi.mocked(dismissInboxSkill);

const inboxSkill: InboxSkill = {
  dirName: 'inbox-skill',
  name: 'Inbox Skill',
  description: 'A test skill',
  extractedAt: '2025-01-15T10:00:00Z',
};

describe('SkillInboxDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListInboxSkills.mockResolvedValue([inboxSkill]);
    mockMoveInboxSkill.mockResolvedValue({
      success: true,
      message: 'Moved "inbox-skill" to ~/.gemini/skills.',
    });
    mockDismissInboxSkill.mockResolvedValue({
      success: true,
      message: 'Dismissed "inbox-skill" from inbox.',
    });
  });

  it('disables the project destination when the workspace is untrusted', async () => {
    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(false),
    } as unknown as Config;
    const onReloadSkills = vi.fn().mockResolvedValue(undefined);
    const { lastFrame, stdin, unmount, waitUntilReady } = await act(async () =>
      renderWithProviders(
        <SkillInboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={onReloadSkills}
        />,
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Inbox Skill');
    });

    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Project');
      expect(frame).toContain('unavailable until this workspace is trusted');
    });

    await act(async () => {
      stdin.write('\x1b[B');
      await waitUntilReady();
    });

    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(mockDismissInboxSkill).toHaveBeenCalledWith(config, 'inbox-skill');
    });
    expect(mockMoveInboxSkill).not.toHaveBeenCalled();
    expect(onReloadSkills).not.toHaveBeenCalled();

    unmount();
  });

  it('shows inline feedback when moving a skill throws', async () => {
    mockMoveInboxSkill.mockRejectedValue(new Error('permission denied'));

    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(true),
    } as unknown as Config;
    const { lastFrame, stdin, unmount, waitUntilReady } = await act(async () =>
      renderWithProviders(
        <SkillInboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={vi.fn().mockResolvedValue(undefined)}
        />,
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Inbox Skill');
    });

    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Move "Inbox Skill"');
      expect(frame).toContain('Failed to install skill: permission denied');
    });

    unmount();
  });

  it('shows inline feedback when reloading skills fails after a move', async () => {
    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(true),
    } as unknown as Config;
    const onReloadSkills = vi
      .fn()
      .mockRejectedValue(new Error('reload hook failed'));
    const { lastFrame, stdin, unmount, waitUntilReady } = await act(async () =>
      renderWithProviders(
        <SkillInboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={onReloadSkills}
        />,
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Inbox Skill');
    });

    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(lastFrame()).toContain(
        'Moved "inbox-skill" to ~/.gemini/skills. Failed to reload skills: reload hook failed',
      );
    });
    expect(onReloadSkills).toHaveBeenCalledTimes(1);

    unmount();
  });
});
