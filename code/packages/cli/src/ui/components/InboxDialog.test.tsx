/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Config,
  InboxSkill,
  InboxPatch,
  InboxMemoryPatch,
} from '@google/gemini-cli-core';
import {
  dismissInboxSkill,
  dismissInboxMemoryPatch,
  listInboxSkills,
  listInboxPatches,
  listInboxMemoryPatches,
  moveInboxSkill,
  applyInboxPatch,
  dismissInboxPatch,
  applyInboxMemoryPatch,
  isProjectSkillPatchTarget,
} from '@google/gemini-cli-core';
import { waitFor } from '../../test-utils/async.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { InboxDialog } from './InboxDialog.js';

const altBufferSettings = createMockSettings({
  ui: { useAlternateBuffer: true },
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();

  return {
    ...original,
    dismissInboxSkill: vi.fn(),
    dismissInboxMemoryPatch: vi.fn(),
    listInboxSkills: vi.fn(),
    listInboxPatches: vi.fn(),
    listInboxMemoryPatches: vi.fn(),
    moveInboxSkill: vi.fn(),
    applyInboxPatch: vi.fn(),
    dismissInboxPatch: vi.fn(),
    applyInboxMemoryPatch: vi.fn(),
    isProjectSkillPatchTarget: vi.fn(),
    getErrorMessage: vi.fn((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    ),
  };
});

const mockListInboxSkills = vi.mocked(listInboxSkills);
const mockListInboxPatches = vi.mocked(listInboxPatches);
const mockListInboxMemoryPatches = vi.mocked(listInboxMemoryPatches);
const mockMoveInboxSkill = vi.mocked(moveInboxSkill);
const mockDismissInboxSkill = vi.mocked(dismissInboxSkill);
const mockApplyInboxPatch = vi.mocked(applyInboxPatch);
const mockDismissInboxPatch = vi.mocked(dismissInboxPatch);
const mockApplyInboxMemoryPatch = vi.mocked(applyInboxMemoryPatch);
const mockDismissInboxMemoryPatch = vi.mocked(dismissInboxMemoryPatch);
const mockIsProjectSkillPatchTarget = vi.mocked(isProjectSkillPatchTarget);

const inboxSkill: InboxSkill = {
  dirName: 'inbox-skill',
  name: 'Inbox Skill',
  description: 'A test skill',
  content:
    '---\nname: Inbox Skill\ndescription: A test skill\n---\n\n## Procedure\n1. Do the thing\n',
  extractedAt: '2025-01-15T10:00:00Z',
};

const inboxPatch: InboxPatch = {
  fileName: 'update-docs.patch',
  name: 'update-docs',
  entries: [
    {
      targetPath: '/home/user/.gemini/skills/docs-writer/SKILL.md',
      diffContent: [
        '--- /home/user/.gemini/skills/docs-writer/SKILL.md',
        '+++ /home/user/.gemini/skills/docs-writer/SKILL.md',
        '@@ -1,3 +1,4 @@',
        ' line1',
        ' line2',
        '+line2.5',
        ' line3',
      ].join('\n'),
    },
  ],
  extractedAt: '2025-01-20T14:00:00Z',
};

const inboxMemoryPatch: InboxMemoryPatch = {
  kind: 'private',
  relativePath: 'private',
  name: 'Private memory',
  sourceFiles: ['update-memory.patch'],
  entries: [
    {
      targetPath: '/home/user/.gemini/tmp/project/memory/MEMORY.md',
      isNewFile: false,
      diffContent: [
        '--- /home/user/.gemini/tmp/project/memory/MEMORY.md',
        '+++ /home/user/.gemini/tmp/project/memory/MEMORY.md',
        '@@ -1,1 +1,1 @@',
        '-old',
        '+use focused tests',
      ].join('\n'),
    },
  ],
  extractedAt: '2025-01-21T10:00:00Z',
};

const workspacePatch: InboxPatch = {
  fileName: 'workspace-update.patch',
  name: 'workspace-update',
  entries: [
    {
      targetPath: '/repo/.gemini/skills/docs-writer/SKILL.md',
      diffContent: [
        '--- /repo/.gemini/skills/docs-writer/SKILL.md',
        '+++ /repo/.gemini/skills/docs-writer/SKILL.md',
        '@@ -1,1 +1,2 @@',
        ' line1',
        '+line2',
      ].join('\n'),
    },
  ],
};

const multiSectionPatch: InboxPatch = {
  fileName: 'multi-section.patch',
  name: 'multi-section',
  entries: [
    {
      targetPath: '/home/user/.gemini/skills/docs-writer/SKILL.md',
      diffContent: [
        '--- /home/user/.gemini/skills/docs-writer/SKILL.md',
        '+++ /home/user/.gemini/skills/docs-writer/SKILL.md',
        '@@ -1,1 +1,2 @@',
        ' line1',
        '+line2',
      ].join('\n'),
    },
    {
      targetPath: '/home/user/.gemini/skills/docs-writer/SKILL.md',
      diffContent: [
        '--- /home/user/.gemini/skills/docs-writer/SKILL.md',
        '+++ /home/user/.gemini/skills/docs-writer/SKILL.md',
        '@@ -3,1 +4,2 @@',
        ' line3',
        '+line4',
      ].join('\n'),
    },
  ],
};

const windowsGlobalPatch: InboxPatch = {
  fileName: 'windows-update.patch',
  name: 'windows-update',
  entries: [
    {
      targetPath: 'C:\\Users\\sandy\\.gemini\\skills\\docs-writer\\SKILL.md',
      diffContent: [
        '--- C:\\Users\\sandy\\.gemini\\skills\\docs-writer\\SKILL.md',
        '+++ C:\\Users\\sandy\\.gemini\\skills\\docs-writer\\SKILL.md',
        '@@ -1,1 +1,2 @@',
        ' line1',
        '+line2',
      ].join('\n'),
    },
  ],
};

describe('InboxDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListInboxSkills.mockResolvedValue([inboxSkill]);
    mockListInboxPatches.mockResolvedValue([]);
    mockListInboxMemoryPatches.mockResolvedValue([]);
    mockMoveInboxSkill.mockResolvedValue({
      success: true,
      message: 'Moved "inbox-skill" to ~/.gemini/skills.',
    });
    mockDismissInboxSkill.mockResolvedValue({
      success: true,
      message: 'Dismissed "inbox-skill" from inbox.',
    });
    mockApplyInboxPatch.mockResolvedValue({
      success: true,
      message: 'Applied patch to 1 file.',
    });
    mockDismissInboxPatch.mockResolvedValue({
      success: true,
      message: 'Dismissed "update-docs.patch" from inbox.',
    });
    mockApplyInboxMemoryPatch.mockResolvedValue({
      success: true,
      message: 'Applied memory patch to 1 file.',
    });
    mockDismissInboxMemoryPatch.mockResolvedValue({
      success: true,
      message: 'Dismissed 1 private memory patch from inbox.',
    });
    mockIsProjectSkillPatchTarget.mockImplementation(
      async (targetPath: string, config: Config) => {
        const projectSkillsDir = config.storage
          ?.getProjectSkillsDir?.()
          ?.replaceAll('\\', '/')
          ?.replace(/\/+$/, '');

        return projectSkillsDir
          ? targetPath.replaceAll('\\', '/').startsWith(projectSkillsDir)
          : false;
      },
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reviews and applies memory patches', async () => {
    mockListInboxSkills.mockResolvedValue([]);
    mockListInboxMemoryPatches.mockResolvedValue([inboxMemoryPatch]);
    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(true),
    } as unknown as Config;
    const onReloadMemory = vi.fn().mockResolvedValue(undefined);
    const { lastFrame, stdin, unmount, waitUntilReady } = await act(async () =>
      renderWithProviders(
        <InboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={vi.fn()}
          onReloadMemory={onReloadMemory}
        />,
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Private memory');
    });

    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Review');
      expect(frame).toMatch(/source patch/);
    });

    // Memory patches default to Dismiss as the highlighted action so a stray
    // Enter cannot apply durable changes. Arrow-down to reach Apply, then
    // press Enter to confirm.
    await act(async () => {
      stdin.write('\u001B[B'); // arrow down → Apply
      await waitUntilReady();
    });
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      // Aggregate apply: relativePath equals the kind name.
      expect(mockApplyInboxMemoryPatch).toHaveBeenCalledWith(
        config,
        'private',
        'private',
      );
      expect(onReloadMemory).toHaveBeenCalled();
    });

    unmount();
  });

  it('disables the project destination when the workspace is untrusted', async () => {
    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(false),
    } as unknown as Config;
    const onReloadSkills = vi.fn().mockResolvedValue(undefined);
    const { lastFrame, stdin, unmount, waitUntilReady } = await act(async () =>
      renderWithProviders(
        <InboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={onReloadSkills}
        />,
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Inbox Skill');
    });

    // Select skill → lands on preview
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('Review new skill');
    });

    // Select "Move" → lands on destination chooser
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Project');
      expect(frame).toContain('unavailable until this workspace is trusted');
    });

    unmount();
  });

  it('shows inline feedback when moving a skill throws', async () => {
    mockMoveInboxSkill.mockRejectedValue(new Error('permission denied'));

    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(true),
    } as unknown as Config;
    const { lastFrame, stdin, unmount, waitUntilReady } = await act(async () =>
      renderWithProviders(
        <InboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={vi.fn().mockResolvedValue(undefined)}
        />,
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Inbox Skill');
    });

    // Select skill → preview
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    // Select "Move" → destination chooser
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    // Select "Global" → triggers move
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
        <InboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={onReloadSkills}
        />,
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Inbox Skill');
    });

    // Select skill → preview
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    // Select "Move" → destination chooser
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    // Select "Global" → triggers move
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

  it('preserves the highlighted row after Esc-ing back from a sub-phase', async () => {
    // Reproduces the bug where pressing Esc from the apply dialog re-rendered
    // the list with focus jumped back to row 0 instead of staying on the row
    // the user was on.
    const secondSkill: InboxSkill = {
      ...inboxSkill,
      dirName: 'second-skill',
      name: 'Second Skill',
    };
    mockListInboxSkills.mockResolvedValue([inboxSkill, secondSkill]);

    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(true),
    } as unknown as Config;
    const { lastFrame, stdin, unmount, waitUntilReady } = await act(async () =>
      renderWithProviders(
        <InboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={vi.fn().mockResolvedValue(undefined)}
        />,
      ),
    );

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Inbox Skill');
      expect(frame).toContain('Second Skill');
    });

    // Arrow down to the second row.
    await act(async () => {
      stdin.write('\x1b[B');
      await waitUntilReady();
    });

    // Enter the second row's preview.
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Review new skill');
      expect(frame).toContain('Second Skill');
    });

    // Esc back to list.
    await act(async () => {
      stdin.write('\x1b');
      await waitUntilReady();
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Inbox Skill');
      expect(frame).toContain('Second Skill');
    });

    // Re-enter (no arrow keys this time). The active row must still be the
    // SECOND skill, not the first — which is what the bug reproduced before.
    await act(async () => {
      stdin.write('\r');
      await waitUntilReady();
    });

    await waitFor(() => {
      const frame = lastFrame();
      expect(frame).toContain('Review new skill');
      // The preview header echoes the highlighted skill's name.
      expect(frame).toContain('Second Skill');
    });

    unmount();
  });

  describe('patch support', () => {
    it('shows patches alongside skills with section headers', async () => {
      mockListInboxPatches.mockResolvedValue([inboxPatch]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
        storage: {
          getProjectSkillsDir: vi.fn().mockReturnValue('/repo/.gemini/skills'),
        },
      } as unknown as Config;
      const { lastFrame, unmount } = await act(async () =>
        renderWithProviders(
          <InboxDialog
            config={config}
            onClose={vi.fn()}
            onReloadSkills={vi.fn().mockResolvedValue(undefined)}
          />,
        ),
      );

      await waitFor(() => {
        const frame = lastFrame();
        expect(frame).toContain('New Skills');
        expect(frame).toContain('Inbox Skill');
        expect(frame).toContain('Skill Updates');
        expect(frame).toContain('update-docs');
      });

      unmount();
    });

    it('shows diff preview when a patch is selected', async () => {
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([inboxPatch]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
        storage: {
          getProjectSkillsDir: vi.fn().mockReturnValue('/repo/.gemini/skills'),
        },
      } as unknown as Config;
      const { lastFrame, stdin, unmount, waitUntilReady } = await act(
        async () =>
          renderWithProviders(
            <InboxDialog
              config={config}
              onClose={vi.fn()}
              onReloadSkills={vi.fn().mockResolvedValue(undefined)}
            />,
          ),
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('update-docs');
      });

      // Select the patch
      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        const frame = lastFrame();
        expect(frame).toContain('Review changes before applying');
        expect(frame).toContain('Apply');
        expect(frame).toContain('Dismiss');
      });

      unmount();
    });

    it('applies a patch when Apply is selected', async () => {
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([inboxPatch]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
        storage: {
          getProjectSkillsDir: vi.fn().mockReturnValue('/repo/.gemini/skills'),
        },
      } as unknown as Config;
      const onReloadSkills = vi.fn().mockResolvedValue(undefined);
      const { stdin, unmount, waitUntilReady } = await act(async () =>
        renderWithProviders(
          <InboxDialog
            config={config}
            onClose={vi.fn()}
            onReloadSkills={onReloadSkills}
          />,
        ),
      );

      await waitFor(() => {
        expect(mockListInboxPatches).toHaveBeenCalled();
      });

      // Select the patch
      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      // Select "Apply"
      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        expect(mockApplyInboxPatch).toHaveBeenCalledWith(
          config,
          'update-docs.patch',
        );
      });
      expect(onReloadSkills).toHaveBeenCalled();

      unmount();
    });

    it('disables Apply for workspace patches in an untrusted workspace', async () => {
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([workspacePatch]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(false),
        storage: {
          getProjectSkillsDir: vi.fn().mockReturnValue('/repo/.gemini/skills'),
        },
      } as unknown as Config;
      const { lastFrame, stdin, unmount, waitUntilReady } = await act(
        async () =>
          renderWithProviders(
            <InboxDialog
              config={config}
              onClose={vi.fn()}
              onReloadSkills={vi.fn().mockResolvedValue(undefined)}
            />,
          ),
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('workspace-update');
      });

      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        const frame = lastFrame();
        expect(frame).toContain('Apply');
        expect(frame).toContain(
          '.gemini/skills — unavailable until this workspace is trusted',
        );
      });
      expect(mockApplyInboxPatch).not.toHaveBeenCalled();

      unmount();
    });

    it('uses canonical project-scope checks before enabling Apply', async () => {
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([workspacePatch]);
      mockIsProjectSkillPatchTarget.mockResolvedValue(true);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(false),
        storage: {
          getProjectSkillsDir: vi
            .fn()
            .mockReturnValue('/symlinked/workspace/.gemini/skills'),
        },
      } as unknown as Config;
      const { lastFrame, stdin, unmount, waitUntilReady } = await act(
        async () =>
          renderWithProviders(
            <InboxDialog
              config={config}
              onClose={vi.fn()}
              onReloadSkills={vi.fn().mockResolvedValue(undefined)}
            />,
          ),
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('workspace-update');
      });

      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        expect(lastFrame()).toContain(
          '.gemini/skills — unavailable until this workspace is trusted',
        );
      });
      expect(mockIsProjectSkillPatchTarget).toHaveBeenCalledWith(
        '/repo/.gemini/skills/docs-writer/SKILL.md',
        config,
      );
      expect(mockApplyInboxPatch).not.toHaveBeenCalled();

      unmount();
    });

    it('dismisses a patch when Dismiss is selected', async () => {
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([inboxPatch]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
        storage: {
          getProjectSkillsDir: vi.fn().mockReturnValue('/repo/.gemini/skills'),
        },
      } as unknown as Config;
      const onReloadSkills = vi.fn().mockResolvedValue(undefined);
      const { stdin, unmount, waitUntilReady } = await act(async () =>
        renderWithProviders(
          <InboxDialog
            config={config}
            onClose={vi.fn()}
            onReloadSkills={onReloadSkills}
          />,
        ),
      );

      await waitFor(() => {
        expect(mockListInboxPatches).toHaveBeenCalled();
      });

      // Select the patch
      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      // Move down to "Dismiss" and select
      await act(async () => {
        stdin.write('\x1b[B');
        await waitUntilReady();
      });

      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        expect(mockDismissInboxPatch).toHaveBeenCalledWith(
          config,
          'update-docs.patch',
        );
      });
      expect(onReloadSkills).not.toHaveBeenCalled();

      unmount();
    });

    it('shows Windows patch entries with a basename and origin tag', async () => {
      vi.stubEnv('USERPROFILE', 'C:\\Users\\sandy');
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([windowsGlobalPatch]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
        storage: {
          getProjectSkillsDir: vi
            .fn()
            .mockReturnValue('C:\\repo\\.gemini\\skills'),
        },
      } as unknown as Config;
      const { lastFrame, unmount } = await act(async () =>
        renderWithProviders(
          <InboxDialog
            config={config}
            onClose={vi.fn()}
            onReloadSkills={vi.fn().mockResolvedValue(undefined)}
          />,
        ),
      );

      await waitFor(() => {
        const frame = lastFrame();
        expect(frame).toContain('[Global]');
        expect(frame).toContain('SKILL.md');
        expect(frame).not.toContain('C:\\Users\\sandy\\.gemini\\skills');
      });

      unmount();
    });

    it('renders multi-section patches without duplicate React keys', async () => {
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([multiSectionPatch]);

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
        storage: {
          getProjectSkillsDir: vi.fn().mockReturnValue('/repo/.gemini/skills'),
        },
      } as unknown as Config;
      const { lastFrame, stdin, unmount, waitUntilReady } = await act(
        async () =>
          renderWithProviders(
            <InboxDialog
              config={config}
              onClose={vi.fn()}
              onReloadSkills={vi.fn().mockResolvedValue(undefined)}
            />,
          ),
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('multi-section');
      });

      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        expect(lastFrame()).toContain('Review changes before applying');
      });

      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Encountered two children with the same key'),
      );

      consoleErrorSpy.mockRestore();
      unmount();
    });

    const tallPatch: InboxPatch = {
      fileName: 'tall.patch',
      name: 'tall-patch',
      entries: [
        {
          targetPath: '/repo/.gemini/skills/docs-writer/SKILL.md',
          diffContent: [
            '--- /repo/.gemini/skills/docs-writer/SKILL.md',
            '+++ /repo/.gemini/skills/docs-writer/SKILL.md',
            '@@ -1,4 +1,8 @@',
            ' line1',
            ' line2',
            '+added-1',
            '+added-2',
            '+added-3',
            '+added-4',
            ' line3',
            ' line4',
          ].join('\n'),
        },
      ],
    };

    it('alt-buffer: renders a bounded ScrollableList viewport for tall patches', async () => {
      // Alt-buffer mode has no terminal scrollback, so the dialog must
      // scroll inside itself. ScrollableList renders a `█` thumb when
      // content exceeds viewport height — the regression signal that the
      // diff is bounded and off-screen content is reachable via PgUp/PgDn.
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([tallPatch]);
      mockListInboxMemoryPatches.mockResolvedValue([]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
        storage: {
          getProjectSkillsDir: vi.fn().mockReturnValue('/repo/.gemini/skills'),
        },
      } as unknown as Config;

      const { lastFrame, stdin, unmount, waitUntilReady } = await act(
        async () =>
          renderWithProviders(
            <InboxDialog
              config={config}
              onClose={vi.fn()}
              onReloadSkills={vi.fn().mockResolvedValue(undefined)}
            />,
            {
              settings: altBufferSettings,
              uiState: { terminalHeight: 18 },
            },
          ),
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('tall-patch');
      });

      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('Apply');
        expect(frame).toContain('Dismiss');
        expect(frame).toContain('█');
      });

      unmount();
    });

    it('alt-buffer: surfaces PgUp/PgDn in the patch-preview footer', async () => {
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([inboxPatch]);
      mockListInboxMemoryPatches.mockResolvedValue([]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
        storage: {
          getProjectSkillsDir: vi.fn().mockReturnValue('/repo/.gemini/skills'),
        },
      } as unknown as Config;

      const { lastFrame, stdin, unmount, waitUntilReady } = await act(
        async () =>
          renderWithProviders(
            <InboxDialog
              config={config}
              onClose={vi.fn()}
              onReloadSkills={vi.fn().mockResolvedValue(undefined)}
            />,
            { settings: altBufferSettings },
          ),
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('update-docs');
      });

      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        expect(lastFrame()).toContain('PgUp/PgDn to scroll');
      });

      unmount();
    });

    it('non-alt-buffer: clips the diff via DiffRenderer with a "lines hidden" hint', async () => {
      // Non-alt-buffer mode uses the codebase's standard bounded
      // DiffRenderer + ShowMoreLines + Ctrl+O pattern (matches
      // FolderTrustDialog/ThemeDialog). MaxSizedBox emits a
      // "... first/last N line(s) hidden ..." hint when it clips, which
      // is the regression signal that the diff is bounded.
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([tallPatch]);
      mockListInboxMemoryPatches.mockResolvedValue([]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
        storage: {
          getProjectSkillsDir: vi.fn().mockReturnValue('/repo/.gemini/skills'),
        },
      } as unknown as Config;

      const { lastFrame, stdin, unmount, waitUntilReady } = await act(
        async () =>
          renderWithProviders(
            <InboxDialog
              config={config}
              onClose={vi.fn()}
              onReloadSkills={vi.fn().mockResolvedValue(undefined)}
            />,
            { uiState: { terminalHeight: 18, constrainHeight: true } },
          ),
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('tall-patch');
      });

      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        expect(lastFrame() ?? '').toMatch(/lines? hidden/);
      });

      unmount();
    });

    it('non-alt-buffer: surfaces Ctrl+O inline (not in the footer) when the diff overflows', async () => {
      // In non-alt-buffer mode the Ctrl+O affordance is rendered inline
      // by ShowMoreLines above the footer when the diff is clipped. The
      // footer itself stays clean (no PgUp/PgDn or Ctrl+O text) since
      // duplicating the hint there would be noisy.
      mockListInboxSkills.mockResolvedValue([]);
      mockListInboxPatches.mockResolvedValue([tallPatch]);
      mockListInboxMemoryPatches.mockResolvedValue([]);

      const config = {
        isTrustedFolder: vi.fn().mockReturnValue(true),
        storage: {
          getProjectSkillsDir: vi.fn().mockReturnValue('/repo/.gemini/skills'),
        },
      } as unknown as Config;

      const { lastFrame, stdin, unmount, waitUntilReady } = await act(
        async () =>
          renderWithProviders(
            <InboxDialog
              config={config}
              onClose={vi.fn()}
              onReloadSkills={vi.fn().mockResolvedValue(undefined)}
            />,
            { uiState: { terminalHeight: 18, constrainHeight: true } },
          ),
      );

      await waitFor(() => {
        expect(lastFrame()).toContain('tall-patch');
      });

      await act(async () => {
        stdin.write('\r');
        await waitUntilReady();
      });

      await waitFor(() => {
        const frame = lastFrame() ?? '';
        expect(frame).toContain('Ctrl+O');
        expect(frame).not.toContain('PgUp/PgDn to scroll');
      });

      unmount();
    });
  });

  it('renders each list row as exactly two lines even with long descriptions', async () => {
    // Reproduces the production bug: with the previous renderer, long
    // descriptions wrapped onto multiple lines (and the date sibling was
    // interleaved into the wrap), making each item 3-5 rows tall and
    // breaking the listMaxItemsToShow budget. The fix uses height={2}
    // and wrap="truncate-end" on every list row.
    const longDescription =
      'This is an extremely long description that would absolutely wrap to ' +
      'multiple lines if rendered without truncation, which used to push the ' +
      'list-phase footer off the bottom of the alternate buffer in production.';
    mockListInboxSkills.mockResolvedValue([
      {
        dirName: 'long-skill',
        name: 'long-skill',
        description: longDescription,
        content: '---\nname: x\ndescription: y\n---\n',
      },
    ]);
    mockListInboxPatches.mockResolvedValue([]);
    mockListInboxMemoryPatches.mockResolvedValue([]);

    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(true),
    } as unknown as Config;

    const { lastFrame, unmount } = await act(async () =>
      renderWithProviders(
        <InboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={vi.fn().mockResolvedValue(undefined)}
        />,
      ),
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('long-skill');
    });

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('production');
    expect(frame).toContain('extremely long description');

    unmount();
  });

  it('keeps the list-phase footer on screen with many long-description skills', async () => {
    const longDesc =
      'A very long description that would wrap across multiple lines if not ' +
      'truncated, which was causing the dialog body to overflow the bottom ' +
      'of the alternate buffer';
    const manySkills: InboxSkill[] = Array.from({ length: 8 }, (_, i) => ({
      dirName: `skill-${i}`,
      name: `skill-${i}`,
      description: `${longDesc} (#${i})`,
      content: '---\nname: x\ndescription: y\n---\n',
    }));
    mockListInboxSkills.mockResolvedValue(manySkills);
    mockListInboxPatches.mockResolvedValue([]);
    mockListInboxMemoryPatches.mockResolvedValue([]);

    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(true),
    } as unknown as Config;

    const { lastFrame, unmount } = await act(async () =>
      renderWithProviders(
        <InboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={vi.fn().mockResolvedValue(undefined)}
        />,
        { uiState: { terminalHeight: 28 } },
      ),
    );

    await waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Memory Inbox');
      expect(frame).toContain('Esc to close');
    });

    unmount();
  });

  it('keeps the list-phase footer on screen on short terminals', async () => {
    const manySkills: InboxSkill[] = Array.from({ length: 12 }, (_, i) => ({
      dirName: `skill-${i}`,
      name: `Skill ${i}`,
      description: `Description ${i}`,
      content: '---\nname: Skill\ndescription: Skill\n---\n',
    }));
    mockListInboxSkills.mockResolvedValue(manySkills);
    mockListInboxPatches.mockResolvedValue([inboxPatch]);
    mockListInboxMemoryPatches.mockResolvedValue([]);

    const config = {
      isTrustedFolder: vi.fn().mockReturnValue(true),
      storage: {
        getProjectSkillsDir: vi.fn().mockReturnValue('/repo/.gemini/skills'),
      },
    } as unknown as Config;

    const { lastFrame, unmount } = await act(async () =>
      renderWithProviders(
        <InboxDialog
          config={config}
          onClose={vi.fn()}
          onReloadSkills={vi.fn().mockResolvedValue(undefined)}
        />,
        { uiState: { terminalHeight: 18 } },
      ),
    );

    await waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Memory Inbox');
      expect(frame).toContain('Esc to close');
    });

    unmount();
  });
});
