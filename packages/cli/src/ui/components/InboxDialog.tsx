/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import type React from 'react';
import { Fragment, useState, useMemo, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from '../hooks/useKeyMatchers.js';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import type { SelectionListItem } from '../hooks/useSelectionList.js';
import { DialogFooter } from './shared/DialogFooter.js';
import {
  DiffRenderer,
  parseDiffWithLineNumbers,
  renderDiffLines,
  type DiffLine,
} from './messages/DiffRenderer.js';
import { ScrollableList } from './shared/ScrollableList.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import {
  type Config,
  type InboxSkill,
  type InboxPatch,
  type InboxMemoryPatch,
  type InboxSkillDestination,
  getErrorMessage,
  listInboxSkills,
  listInboxPatches,
  listInboxMemoryPatches,
  moveInboxSkill,
  dismissInboxSkill,
  applyInboxPatch,
  dismissInboxPatch,
  applyInboxMemoryPatch,
  dismissInboxMemoryPatch,
  isProjectSkillPatchTarget,
} from '@google/gemini-cli-core';

type Phase =
  | 'list'
  | 'skill-preview'
  | 'skill-action'
  | 'patch-preview'
  | 'memory-preview';

type InboxItem =
  | { type: 'skill'; skill: InboxSkill }
  | { type: 'patch'; patch: InboxPatch; targetsProjectSkills: boolean }
  | { type: 'memory-patch'; memoryPatch: InboxMemoryPatch }
  | { type: 'header'; label: string };

interface DestinationChoice {
  destination: InboxSkillDestination;
  label: string;
  description: string;
}

interface PatchAction {
  action: 'apply' | 'dismiss';
  label: string;
  description: string;
}

interface MemoryPatchAction {
  action: 'apply' | 'dismiss';
  label: string;
  description: string;
}

const SKILL_DESTINATION_CHOICES: DestinationChoice[] = [
  {
    destination: 'global',
    label: 'Global',
    description: '~/.gemini/skills — available in all projects',
  },
  {
    destination: 'project',
    label: 'Project',
    description: '.gemini/skills — available in this workspace',
  },
];

interface SkillPreviewAction {
  action: 'move' | 'dismiss';
  label: string;
  description: string;
}

const SKILL_PREVIEW_CHOICES: SkillPreviewAction[] = [
  {
    action: 'move',
    label: 'Move',
    description: 'Choose where to install this skill',
  },
  {
    action: 'dismiss',
    label: 'Dismiss',
    description: 'Delete from inbox',
  },
];

const PATCH_ACTION_CHOICES: PatchAction[] = [
  {
    action: 'apply',
    label: 'Apply',
    description: 'Apply patch and delete from inbox',
  },
  {
    action: 'dismiss',
    label: 'Dismiss',
    description: 'Delete from inbox without applying',
  },
];

// Dismiss-first: memory patches modify durable on-disk state outside the
// project (private MEMORY.md and sibling files, plus ~/.gemini/GEMINI.md),
// so a stray Enter on a freshly-opened memory-patch preview must NOT apply.
// The lower-stakes skill-patch list (PATCH_ACTION_CHOICES) keeps Apply as
// the default.
const MEMORY_PATCH_ACTION_CHOICES: MemoryPatchAction[] = [
  {
    action: 'dismiss',
    label: 'Dismiss',
    description: 'Delete from inbox without applying',
  },
  {
    action: 'apply',
    label: 'Apply',
    description: 'Apply patch and delete from inbox',
  },
];

function normalizePathForUi(filePath: string): string {
  return path.posix.normalize(filePath.replaceAll('\\', '/'));
}

function getPathBasename(filePath: string): string {
  const normalizedPath = normalizePathForUi(filePath);
  const basename = path.posix.basename(normalizedPath);
  return basename === '.' ? filePath : basename;
}

function formatMemoryPatchSummary(patch: InboxMemoryPatch): string {
  const hunkCount = patch.entries.length;
  const sourceCount = patch.sourceFiles.length;
  const hunkLabel = hunkCount === 1 ? 'hunk' : 'hunks';
  const sourceLabel = sourceCount === 1 ? 'patch' : 'patches';
  return `${hunkCount} ${hunkLabel} from ${sourceCount} source ${sourceLabel}`;
}

async function patchTargetsProjectSkills(
  patch: InboxPatch,
  config: Config,
): Promise<boolean> {
  const entryTargetsProjectSkills = await Promise.all(
    patch.entries.map((entry) =>
      isProjectSkillPatchTarget(entry.targetPath, config),
    ),
  );
  return entryTargetsProjectSkills.some(Boolean);
}

/**
 * Derives a bracketed origin tag from a skill file path,
 * matching the existing [Built-in] convention in SkillsList.
 */
function getSkillOriginTag(filePath: string): string {
  const normalizedPath = normalizePathForUi(filePath);

  if (normalizedPath.includes('/bundle/')) {
    return 'Built-in';
  }
  if (normalizedPath.includes('/extensions/')) {
    return 'Extension';
  }
  if (normalizedPath.includes('/.gemini/skills/')) {
    const homeDirs = [process.env['HOME'], process.env['USERPROFILE']]
      .filter((homeDir): homeDir is string => Boolean(homeDir))
      .map(normalizePathForUi);
    if (
      homeDirs.some((homeDir) =>
        normalizedPath.startsWith(`${homeDir}/.gemini/skills/`),
      )
    ) {
      return 'Global';
    }
    return 'Workspace';
  }
  return '';
}

/**
 * Creates a unified diff string representing a new file.
 */
function newFileDiff(filename: string, content: string): string {
  const lines = content.split('\n');
  const hunkLines = lines.map((l) => `+${l}`).join('\n');
  return [
    `--- /dev/null`,
    `+++ ${filename}`,
    `@@ -0,0 +1,${lines.length} @@`,
    hunkLines,
  ].join('\n');
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

interface DiffSection {
  /** Stable identifier for the section (e.g. patch entry path + index). */
  key: string;
  /** Header rendered above the diff body, e.g. file path or "SKILL.md". */
  header: string;
  /** Raw unified-diff string. Parsed via parseDiffWithLineNumbers. */
  diffContent: string;
}

interface DiffViewportItem {
  key: string;
  /** Pre-rendered React node for this row. */
  element: React.ReactElement;
}

/**
 * A fixed-height, scrollable diff viewer used by the skill, patch, and
 * memory-patch preview phases. It flattens one or more DiffSections into
 * individual line items so ScrollableList can virtualize and so
 * PgUp/PgDn/Shift+arrows move the viewport over arbitrarily long diffs
 * without overflowing the alternate buffer.
 *
 * The visual styling matches DiffRenderer's renderDiffLines path; we share
 * that helper instead of nesting DiffRenderer (whose own MaxSizedBox
 * wrapping would interfere with virtualization).
 */
const ScrollableDiffViewport: React.FC<{
  sections: DiffSection[];
  width: number;
  height: number;
  hasFocus: boolean;
}> = ({ sections, width, height, hasFocus }) => {
  const items = useMemo<DiffViewportItem[]>(() => {
    const result: DiffViewportItem[] = [];
    sections.forEach((section, sectionIndex) => {
      // Header (with a blank spacer row above for separation between
      // sections — skipped above the first section).
      if (sectionIndex > 0) {
        result.push({
          key: `${section.key}:spacer`,
          element: <Text> </Text>,
        });
      }
      result.push({
        key: `${section.key}:header`,
        element: (
          <Text color={theme.text.secondary} bold>
            {section.header}
          </Text>
        ),
      });

      const parsed: DiffLine[] = parseDiffWithLineNumbers(section.diffContent);
      const rendered = renderDiffLines({
        parsedLines: parsed,
        filename: section.header,
        terminalWidth: width,
      });
      rendered.forEach((node, index) => {
        result.push({
          key: `${section.key}:line:${index}`,
          // renderDiffLines emits ReactNodes with their own keys; wrap each
          // in a Fragment so ScrollableList sees a single ReactElement per
          // row regardless of node shape.
          element: <Fragment>{node}</Fragment>,
        });
      });
    });
    return result;
  }, [sections, width]);

  const renderItem = useCallback(
    ({ item }: { item: DiffViewportItem }) => item.element,
    [],
  );
  const keyExtractor = useCallback((item: DiffViewportItem) => item.key, []);
  // Most diff rows are exactly one line tall; long lines wrap so this is a
  // lower bound. ScrollableList re-measures via ResizeObserver, so the
  // estimate only matters for initial sizing.
  const estimatedItemHeight = useCallback(() => 1, []);

  return (
    <Box height={height} width={width} flexShrink={0} flexDirection="column">
      <ScrollableList<DiffViewportItem>
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimatedItemHeight={estimatedItemHeight}
        hasFocus={hasFocus}
        initialScrollIndex={0}
        scrollbar={true}
      />
    </Box>
  );
};

interface InboxDialogProps {
  config: Config;
  onClose: () => void;
  onReloadSkills: () => Promise<void>;
  onReloadMemory?: () => Promise<void>;
}

export const InboxDialog: React.FC<InboxDialogProps> = ({
  config,
  onClose,
  onReloadSkills,
  onReloadMemory,
}) => {
  const keyMatchers = useKeyMatchers();
  const { terminalWidth, terminalHeight, constrainHeight } = useUIState();
  const isAlternateBuffer = useAlternateBuffer();
  const isTrustedFolder = config.isTrustedFolder();
  const [phase, setPhase] = useState<Phase>('list');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [feedback, setFeedback] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  // Tracks the most recent highlighted/selected position in the list so we
  // can restore focus when the user backs out of a sub-phase (e.g. ESC from
  // the apply dialog) instead of jumping back to the top of the list.
  const [lastListIndex, setLastListIndex] = useState(0);

  // Load inbox skills and patches on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [skills, patches, memoryPatches] = await Promise.all([
          listInboxSkills(config),
          listInboxPatches(config),
          listInboxMemoryPatches(config),
        ]);
        const patchItems = await Promise.all(
          patches.map(async (patch): Promise<InboxItem> => {
            let targetsProjectSkills = false;
            try {
              targetsProjectSkills = await patchTargetsProjectSkills(
                patch,
                config,
              );
            } catch {
              targetsProjectSkills = false;
            }

            return {
              type: 'patch',
              patch,
              targetsProjectSkills,
            };
          }),
        );
        if (!cancelled) {
          const combined: InboxItem[] = [
            ...skills.map((skill): InboxItem => ({ type: 'skill', skill })),
            ...patchItems,
            ...memoryPatches.map(
              (memoryPatch): InboxItem => ({
                type: 'memory-patch',
                memoryPatch,
              }),
            ),
          ];
          setItems(combined);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config]);

  const getItemKey = useCallback(
    (item: InboxItem): string =>
      item.type === 'skill'
        ? `skill:${item.skill.dirName}`
        : item.type === 'patch'
          ? `patch:${item.patch.fileName}`
          : item.type === 'memory-patch'
            ? `memory:${item.memoryPatch.kind}:${item.memoryPatch.relativePath}`
            : `header:${item.label}`,
    [],
  );

  const listItems: Array<SelectionListItem<InboxItem>> = useMemo(() => {
    const skills = items.filter((i) => i.type === 'skill');
    const patches = items.filter((i) => i.type === 'patch');
    const memoryPatches = items.filter((i) => i.type === 'memory-patch');
    const result: Array<SelectionListItem<InboxItem>> = [];

    const groups: Array<{ label: string; items: InboxItem[] }> = [
      { label: 'New Skills', items: skills },
      { label: 'Skill Updates', items: patches },
      { label: 'Memory Updates', items: memoryPatches },
    ].filter((group) => group.items.length > 0);
    const showHeaders = groups.length > 1;

    for (const group of groups) {
      if (showHeaders) {
        const header: InboxItem = { type: 'header', label: group.label };
        result.push({
          key: `header:${group.label}`,
          value: header,
          disabled: true,
          hideNumber: true,
        });
      }
      for (const item of group.items) {
        result.push({ key: getItemKey(item), value: item });
      }
    }

    return result;
  }, [items, getItemKey]);

  const destinationItems: Array<SelectionListItem<DestinationChoice>> = useMemo(
    () =>
      SKILL_DESTINATION_CHOICES.map((choice) => {
        if (choice.destination === 'project' && !isTrustedFolder) {
          return {
            key: choice.destination,
            value: {
              ...choice,
              description:
                '.gemini/skills — unavailable until this workspace is trusted',
            },
            disabled: true,
          };
        }

        return {
          key: choice.destination,
          value: choice,
        };
      }),
    [isTrustedFolder],
  );

  const selectedPatchTargetsProjectSkills = useMemo(() => {
    if (!selectedItem || selectedItem.type !== 'patch') {
      return false;
    }

    return selectedItem.targetsProjectSkills;
  }, [selectedItem]);

  const patchActionItems: Array<SelectionListItem<PatchAction>> = useMemo(
    () =>
      PATCH_ACTION_CHOICES.map((choice) => {
        if (
          choice.action === 'apply' &&
          selectedPatchTargetsProjectSkills &&
          !isTrustedFolder
        ) {
          return {
            key: choice.action,
            value: {
              ...choice,
              description:
                '.gemini/skills — unavailable until this workspace is trusted',
            },
            disabled: true,
          };
        }

        return {
          key: choice.action,
          value: choice,
        };
      }),
    [isTrustedFolder, selectedPatchTargetsProjectSkills],
  );

  const skillPreviewItems: Array<SelectionListItem<SkillPreviewAction>> =
    useMemo(
      () =>
        SKILL_PREVIEW_CHOICES.map((choice) => ({
          key: choice.action,
          value: choice,
        })),
      [],
    );

  const memoryPatchActionItems: Array<SelectionListItem<MemoryPatchAction>> =
    useMemo(
      () =>
        MEMORY_PATCH_ACTION_CHOICES.map((choice) => ({
          key: choice.action,
          value: choice,
        })),
      [],
    );

  const handleSelectItem = useCallback(
    (item: InboxItem) => {
      setSelectedItem(item);
      setFeedback(null);
      // Remember which list row we navigated away from so ESC restores focus
      // instead of jumping the cursor back to the top of the list.
      const idx = listItems.findIndex((i) => i.value === item);
      if (idx >= 0) {
        setLastListIndex(idx);
      }
      setPhase(
        item.type === 'skill'
          ? 'skill-preview'
          : item.type === 'patch'
            ? 'patch-preview'
            : 'memory-preview',
      );
    },
    [listItems],
  );

  const removeItem = useCallback(
    (item: InboxItem) => {
      setItems((prev) =>
        prev.filter((i) => getItemKey(i) !== getItemKey(item)),
      );
    },
    [getItemKey],
  );

  const handleSkillPreviewAction = useCallback(
    (choice: SkillPreviewAction) => {
      if (!selectedItem || selectedItem.type !== 'skill') return;

      if (choice.action === 'move') {
        setFeedback(null);
        setPhase('skill-action');
        return;
      }

      // Dismiss
      setFeedback(null);
      const skill = selectedItem.skill;
      void (async () => {
        try {
          const result = await dismissInboxSkill(config, skill.dirName);
          setFeedback({ text: result.message, isError: !result.success });
          if (result.success) {
            removeItem(selectedItem);
            setSelectedItem(null);
            setPhase('list');
          }
        } catch (error) {
          setFeedback({
            text: `Failed to dismiss skill: ${getErrorMessage(error)}`,
            isError: true,
          });
        }
      })();
    },
    [config, selectedItem, removeItem],
  );

  const handleSelectDestination = useCallback(
    (choice: DestinationChoice) => {
      if (!selectedItem || selectedItem.type !== 'skill') return;
      const skill = selectedItem.skill;

      if (choice.destination === 'project' && !config.isTrustedFolder()) {
        setFeedback({
          text: 'Project skills are unavailable until this workspace is trusted.',
          isError: true,
        });
        return;
      }

      setFeedback(null);

      void (async () => {
        try {
          const result = await moveInboxSkill(
            config,
            skill.dirName,
            choice.destination,
          );

          setFeedback({ text: result.message, isError: !result.success });

          if (!result.success) {
            return;
          }

          removeItem(selectedItem);
          setSelectedItem(null);
          setPhase('list');

          try {
            await onReloadSkills();
          } catch (error) {
            setFeedback({
              text: `${result.message} Failed to reload skills: ${getErrorMessage(error)}`,
              isError: true,
            });
          }
        } catch (error) {
          setFeedback({
            text: `Failed to install skill: ${getErrorMessage(error)}`,
            isError: true,
          });
        }
      })();
    },
    [config, selectedItem, onReloadSkills, removeItem],
  );

  const handleSelectPatchAction = useCallback(
    (choice: PatchAction) => {
      if (!selectedItem || selectedItem.type !== 'patch') return;
      const patch = selectedItem.patch;

      if (
        choice.action === 'apply' &&
        !config.isTrustedFolder() &&
        selectedItem.targetsProjectSkills
      ) {
        setFeedback({
          text: 'Project skill patches are unavailable until this workspace is trusted.',
          isError: true,
        });
        return;
      }

      setFeedback(null);

      void (async () => {
        try {
          let result: { success: boolean; message: string };
          if (choice.action === 'apply') {
            result = await applyInboxPatch(config, patch.fileName);
          } else {
            result = await dismissInboxPatch(config, patch.fileName);
          }

          setFeedback({ text: result.message, isError: !result.success });

          if (!result.success) {
            return;
          }

          removeItem(selectedItem);
          setSelectedItem(null);
          setPhase('list');

          if (choice.action === 'apply') {
            try {
              await onReloadSkills();
            } catch (error) {
              setFeedback({
                text: `${result.message} Failed to reload skills: ${getErrorMessage(error)}`,
                isError: true,
              });
            }
          }
        } catch (error) {
          const operation =
            choice.action === 'apply' ? 'apply patch' : 'dismiss patch';
          setFeedback({
            text: `Failed to ${operation}: ${getErrorMessage(error)}`,
            isError: true,
          });
        }
      })();
    },
    [config, selectedItem, onReloadSkills, removeItem],
  );

  const handleSelectMemoryPatchAction = useCallback(
    (choice: MemoryPatchAction) => {
      if (!selectedItem || selectedItem.type !== 'memory-patch') return;
      const memoryPatch = selectedItem.memoryPatch;

      setFeedback(null);

      void (async () => {
        try {
          let result: { success: boolean; message: string };
          if (choice.action === 'apply') {
            result = await applyInboxMemoryPatch(
              config,
              memoryPatch.kind,
              memoryPatch.relativePath,
            );
          } else {
            result = await dismissInboxMemoryPatch(
              config,
              memoryPatch.kind,
              memoryPatch.relativePath,
            );
          }

          setFeedback({ text: result.message, isError: !result.success });

          if (!result.success) {
            return;
          }

          removeItem(selectedItem);
          setSelectedItem(null);
          setPhase('list');

          if (choice.action === 'apply' && onReloadMemory) {
            try {
              await onReloadMemory();
            } catch (error) {
              setFeedback({
                text: `${result.message} Failed to reload memory: ${getErrorMessage(error)}`,
                isError: true,
              });
            }
          }
        } catch (error) {
          const operation =
            choice.action === 'apply'
              ? 'apply memory patch'
              : 'dismiss memory patch';
          setFeedback({
            text: `Failed to ${operation}: ${getErrorMessage(error)}`,
            isError: true,
          });
        }
      })();
    },
    [config, selectedItem, onReloadMemory, removeItem],
  );

  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        if (phase === 'skill-action') {
          setPhase('skill-preview');
          setFeedback(null);
        } else if (phase !== 'list') {
          setPhase('list');
          setSelectedItem(null);
          setFeedback(null);
        } else {
          onClose();
        }
        return true;
      }
      return false;
    },
    { isActive: true, priority: true },
  );

  // Hoist the per-phase preview data so the array literals passed to
  // ScrollableDiffViewport don't change identity on every parent render.
  // ScrollableDiffViewport memoizes its expensive `parseDiffWithLineNumbers`
  // + `renderDiffLines` on `sections`, so a new array literal every render
  // would defeat that and re-colorize the diff each time. Keying on
  // `selectedItem` captures every input that affects the rendered diffs.
  // Must live above the early returns below so React sees a consistent
  // hook order.
  const previewData = useMemo(() => {
    if (!selectedItem) {
      return {
        skillSections: undefined as DiffSection[] | undefined,
        patchSections: undefined as DiffSection[] | undefined,
        memoryGroups: undefined as
          | Array<[string, { isNewFile: boolean; diffs: string[] }]>
          | undefined,
        memorySections: undefined as DiffSection[] | undefined,
      };
    }

    if (selectedItem.type === 'skill') {
      const skill = selectedItem.skill;
      if (!skill.content) {
        return {
          skillSections: undefined,
          patchSections: undefined,
          memoryGroups: undefined,
          memorySections: undefined,
        };
      }
      return {
        skillSections: [
          {
            key: `skill:${skill.dirName}`,
            header: 'SKILL.md',
            diffContent: newFileDiff('SKILL.md', skill.content),
          },
        ],
        patchSections: undefined,
        memoryGroups: undefined,
        memorySections: undefined,
      };
    }

    if (selectedItem.type === 'patch') {
      const patch = selectedItem.patch;
      return {
        skillSections: undefined,
        patchSections: patch.entries.map((entry, index) => ({
          key: `${patch.fileName}:${entry.targetPath}:${index}`,
          header: entry.targetPath,
          diffContent: entry.diffContent,
        })),
        memoryGroups: undefined,
        memorySections: undefined,
      };
    }

    if (selectedItem.type === 'memory-patch') {
      // Group hunks by target file. Multiple source patches may touch the
      // same file (e.g. several patches all updating MEMORY.md); showing
      // the file path once with all its hunks beneath is less noisy than
      // repeating the path for every hunk.
      const groups = new Map<string, { isNewFile: boolean; diffs: string[] }>();
      for (const entry of selectedItem.memoryPatch.entries) {
        const existing = groups.get(entry.targetPath);
        if (existing) {
          existing.diffs.push(entry.diffContent);
          if (entry.isNewFile) existing.isNewFile = true;
        } else {
          groups.set(entry.targetPath, {
            isNewFile: entry.isNewFile,
            diffs: [entry.diffContent],
          });
        }
      }
      const memoryGroups = Array.from(groups.entries());

      const memorySections: DiffSection[] = [];
      memoryGroups.forEach(([targetPath, { isNewFile, diffs }], groupIndex) => {
        const headerAnnotation = `${isNewFile ? ' (new file)' : ''}${
          diffs.length > 1
            ? ` · ${diffs.length} changes from different patches`
            : ''
        }`;
        diffs.forEach((diff, hunkIndex) => {
          memorySections.push({
            key: `${targetPath}:${groupIndex}:${hunkIndex}`,
            header:
              hunkIndex === 0 ? `${targetPath}${headerAnnotation}` : targetPath,
            diffContent: diff,
          });
        });
      });

      return {
        skillSections: undefined,
        patchSections: undefined,
        memoryGroups,
        memorySections,
      };
    }

    return {
      skillSections: undefined,
      patchSections: undefined,
      memoryGroups: undefined,
      memorySections: undefined,
    };
  }, [selectedItem]);

  if (loading) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={2}
        paddingY={1}
      >
        <Text>Loading inbox…</Text>
      </Box>
    );
  }

  if (items.length === 0 && !feedback) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={2}
        paddingY={1}
      >
        <Text bold>Memory Inbox</Text>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>No items in inbox.</Text>
        </Box>
        <DialogFooter primaryAction="Esc to close" cancelAction="" />
      </Box>
    );
  }

  // Border + paddingX account for 6 chars of width
  const contentWidth = terminalWidth - 6;

  // Diff-rendering budgets. Two strategies, picked by `isAlternateBuffer`:
  //
  // - Alt-buffer: a fixed-height ScrollableList viewport. There is no
  //   terminal scrollback, so we must scroll inside the dialog itself
  //   via PgUp/PgDn/Shift+arrows.
  //
  // - Non-alt-buffer: the codebase's standard pattern of a bounded
  //   DiffRenderer + ShowMoreLines + Ctrl+O (see FolderTrustDialog,
  //   ThemeDialog). Clipped content lands in terminal scrollback when
  //   the user expands via Ctrl+O.
  //
  // Chrome accounts for the dialog's borders, padding, title + subtitle,
  // action list (two `minHeight={2}` rows), the section's `marginTop`,
  // the dialog footer, and a couple of safety rows. Bumped when inline
  // feedback is showing.
  const DIALOG_CHROME_HEIGHT = 16;
  const feedbackHeight = feedback ? 2 : 0;
  const diffViewportHeight = Math.max(
    3,
    terminalHeight - DIALOG_CHROME_HEIGHT - feedbackHeight,
  );

  // For the non-alt-buffer DiffRenderer path, mirror MainContent /
  // DialogManager and drop the clamp when the user has pressed Ctrl+O.
  const availableContentHeight = constrainHeight
    ? diffViewportHeight
    : undefined;
  const PATCH_ENTRY_OVERHEAD = 2; // target-path label + marginBottom
  const patchEntryCount =
    selectedItem?.type === 'patch'
      ? selectedItem.patch.entries.length
      : selectedItem?.type === 'memory-patch'
        ? selectedItem.memoryPatch.entries.length
        : 1;
  const availablePatchEntryHeight =
    availableContentHeight === undefined
      ? undefined
      : Math.max(
          3,
          Math.floor(
            (availableContentHeight - patchEntryCount * PATCH_ENTRY_OVERHEAD) /
              Math.max(1, patchEntryCount),
          ),
        );

  const previewNavigationHint = isAlternateBuffer
    ? 'PgUp/PgDn to scroll'
    : undefined;

  // Budget the list phase so the dialog footer never clips on shorter
  // terminals. Every visible row — skill items, patch items, memory-patch
  // items, and the section headers — renders at exactly 2 rows tall
  // (enforced by `height={2}` on item renders and `marginTop={1}` + 1
  // text line for headers), so the windowed-slot count maps directly to
  // terminal rows.
  //
  // Chrome rows accounted for:
  //   - round border (2)
  //   - paddingY (2)
  //   - DefaultAppLayout's alt-buffer paddingBottom (1)
  //   - title + subtitle (2)
  //   - marginTop above the list (1)
  //   - dialog footer marginTop + text (2)
  //   - BaseSelectionList ▲ + ▼ scroll arrows (2) — always shown when
  //     items > maxItemsToShow, which is precisely when this budget
  //     matters
  const LIST_PHASE_CHROME_HEIGHT = 12;
  const LIST_ROW_HEIGHT = 2;
  const listMaxItemsToShow = Math.max(
    1,
    Math.min(
      8,
      Math.floor(
        (terminalHeight - LIST_PHASE_CHROME_HEIGHT - feedbackHeight) /
          LIST_ROW_HEIGHT,
      ),
    ),
  );

  return (
    <OverflowProvider>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        paddingX={2}
        paddingY={1}
        width="100%"
      >
        {phase === 'list' && (
          <>
            <Text bold>
              Memory Inbox ({items.length} item{items.length !== 1 ? 's' : ''})
            </Text>
            <Text color={theme.text.secondary}>
              Extracted from past sessions. Select one to review.
            </Text>

            <Box flexDirection="column" marginTop={1}>
              <BaseSelectionList<InboxItem>
                items={listItems}
                initialIndex={Math.max(
                  0,
                  Math.min(lastListIndex, listItems.length - 1),
                )}
                onSelect={handleSelectItem}
                isFocused={true}
                showNumbers={false}
                showScrollArrows={true}
                maxItemsToShow={listMaxItemsToShow}
                renderItem={(item, { titleColor }) => {
                  if (item.value.type === 'header') {
                    return (
                      <Box marginTop={1}>
                        <Text color={theme.text.secondary} bold>
                          {item.value.label}
                        </Text>
                      </Box>
                    );
                  }
                  if (item.value.type === 'skill') {
                    const skill = item.value.skill;
                    const subtitle = skill.extractedAt
                      ? `${skill.description} · ${formatDate(skill.extractedAt)}`
                      : skill.description;
                    return (
                      <Box flexDirection="column" height={2}>
                        <Text color={titleColor} bold wrap="truncate-end">
                          {skill.name}
                        </Text>
                        <Text color={theme.text.secondary} wrap="truncate-end">
                          {subtitle}
                        </Text>
                      </Box>
                    );
                  }
                  if (item.value.type === 'memory-patch') {
                    const memoryPatch = item.value.memoryPatch;
                    const summary = formatMemoryPatchSummary(memoryPatch);
                    const subtitle = memoryPatch.extractedAt
                      ? `${summary} · ${formatDate(memoryPatch.extractedAt)}`
                      : summary;
                    return (
                      <Box flexDirection="column" height={2}>
                        <Text color={titleColor} bold wrap="truncate-end">
                          {memoryPatch.name}
                        </Text>
                        <Text color={theme.text.secondary} wrap="truncate-end">
                          {subtitle}
                        </Text>
                      </Box>
                    );
                  }
                  const patch = item.value.patch;
                  const fileNames = patch.entries.map((e) =>
                    getPathBasename(e.targetPath),
                  );
                  const origin = getSkillOriginTag(
                    patch.entries[0]?.targetPath ?? '',
                  );
                  const titleLine = origin
                    ? `${patch.name} [${origin}]`
                    : patch.name;
                  const subtitle = patch.extractedAt
                    ? `${fileNames.join(', ')} · ${formatDate(patch.extractedAt)}`
                    : fileNames.join(', ');
                  return (
                    <Box flexDirection="column" height={2}>
                      <Text color={titleColor} bold wrap="truncate-end">
                        {titleLine}
                      </Text>
                      <Text color={theme.text.secondary} wrap="truncate-end">
                        {subtitle}
                      </Text>
                    </Box>
                  );
                }}
              />
            </Box>

            {feedback && (
              <Box marginTop={1}>
                <Text
                  color={
                    feedback.isError ? theme.status.error : theme.status.success
                  }
                >
                  {feedback.isError ? '✗ ' : '✓ '}
                  {feedback.text}
                </Text>
              </Box>
            )}

            <DialogFooter
              primaryAction="Enter to select"
              cancelAction="Esc to close"
            />
          </>
        )}

        {phase === 'skill-preview' && selectedItem?.type === 'skill' && (
          <>
            <Text bold>{selectedItem.skill.name}</Text>
            <Text color={theme.text.secondary}>
              Review new skill before installing.
            </Text>

            {selectedItem.skill.content &&
              (isAlternateBuffer ? (
                <Box flexDirection="column" marginTop={1}>
                  <ScrollableDiffViewport
                    sections={previewData.skillSections ?? []}
                    width={contentWidth}
                    height={diffViewportHeight}
                    hasFocus={true}
                  />
                </Box>
              ) : (
                <Box flexDirection="column" marginTop={1}>
                  <Text color={theme.text.secondary} bold>
                    SKILL.md
                  </Text>
                  <DiffRenderer
                    diffContent={newFileDiff(
                      'SKILL.md',
                      selectedItem.skill.content,
                    )}
                    filename="SKILL.md"
                    terminalWidth={contentWidth}
                    availableTerminalHeight={availableContentHeight}
                  />
                </Box>
              ))}

            <Box flexDirection="column" marginTop={1}>
              <BaseSelectionList<SkillPreviewAction>
                items={skillPreviewItems}
                onSelect={handleSkillPreviewAction}
                isFocused={true}
                showNumbers={true}
                renderItem={(item, { titleColor }) => (
                  <Box flexDirection="column" minHeight={2}>
                    <Text color={titleColor} bold>
                      {item.value.label}
                    </Text>
                    <Text color={theme.text.secondary}>
                      {item.value.description}
                    </Text>
                  </Box>
                )}
              />
            </Box>

            {feedback && (
              <Box marginTop={1}>
                <Text
                  color={
                    feedback.isError ? theme.status.error : theme.status.success
                  }
                >
                  {feedback.isError ? '✗ ' : '✓ '}
                  {feedback.text}
                </Text>
              </Box>
            )}

            {!isAlternateBuffer && (
              <ShowMoreLines constrainHeight={constrainHeight} />
            )}

            <DialogFooter
              primaryAction="Enter to confirm"
              navigationActions={previewNavigationHint}
              cancelAction="Esc to go back"
            />
          </>
        )}

        {phase === 'skill-action' && selectedItem?.type === 'skill' && (
          <>
            <Text bold>Move &quot;{selectedItem.skill.name}&quot;</Text>
            <Text color={theme.text.secondary}>
              Choose where to install this skill.
            </Text>

            <Box flexDirection="column" marginTop={1}>
              <BaseSelectionList<DestinationChoice>
                items={destinationItems}
                onSelect={handleSelectDestination}
                isFocused={true}
                showNumbers={true}
                renderItem={(item, { titleColor }) => (
                  <Box flexDirection="column" minHeight={2}>
                    <Text color={titleColor} bold>
                      {item.value.label}
                    </Text>
                    <Text color={theme.text.secondary}>
                      {item.value.description}
                    </Text>
                  </Box>
                )}
              />
            </Box>

            {feedback && (
              <Box marginTop={1}>
                <Text
                  color={
                    feedback.isError ? theme.status.error : theme.status.success
                  }
                >
                  {feedback.isError ? '✗ ' : '✓ '}
                  {feedback.text}
                </Text>
              </Box>
            )}

            <DialogFooter
              primaryAction="Enter to confirm"
              cancelAction="Esc to go back"
            />
          </>
        )}

        {phase === 'patch-preview' && selectedItem?.type === 'patch' && (
          <>
            <Text bold>{selectedItem.patch.name}</Text>
            <Box flexDirection="row">
              <Text color={theme.text.secondary}>
                Review changes before applying.
              </Text>
              {(() => {
                const origin = getSkillOriginTag(
                  selectedItem.patch.entries[0]?.targetPath ?? '',
                );
                return origin ? (
                  <Text color={theme.text.secondary}>{` [${origin}]`}</Text>
                ) : null;
              })()}
            </Box>

            <Box flexDirection="column" marginTop={1}>
              {isAlternateBuffer ? (
                <ScrollableDiffViewport
                  sections={previewData.patchSections ?? []}
                  width={contentWidth}
                  height={diffViewportHeight}
                  hasFocus={true}
                />
              ) : (
                selectedItem.patch.entries.map((entry, index) => (
                  <Box
                    key={`${selectedItem.patch.fileName}:${entry.targetPath}:${index}`}
                    flexDirection="column"
                    marginBottom={1}
                  >
                    <Text color={theme.text.secondary} bold>
                      {entry.targetPath}
                    </Text>
                    <DiffRenderer
                      diffContent={entry.diffContent}
                      filename={entry.targetPath}
                      terminalWidth={contentWidth}
                      availableTerminalHeight={availablePatchEntryHeight}
                    />
                  </Box>
                ))
              )}
            </Box>

            <Box flexDirection="column" marginTop={1}>
              <BaseSelectionList<PatchAction>
                items={patchActionItems}
                onSelect={handleSelectPatchAction}
                isFocused={true}
                showNumbers={true}
                renderItem={(item, { titleColor }) => (
                  <Box flexDirection="column" minHeight={2}>
                    <Text color={titleColor} bold>
                      {item.value.label}
                    </Text>
                    <Text color={theme.text.secondary}>
                      {item.value.description}
                    </Text>
                  </Box>
                )}
              />
            </Box>

            {feedback && (
              <Box marginTop={1}>
                <Text
                  color={
                    feedback.isError ? theme.status.error : theme.status.success
                  }
                >
                  {feedback.isError ? '✗ ' : '✓ '}
                  {feedback.text}
                </Text>
              </Box>
            )}

            {!isAlternateBuffer && (
              <ShowMoreLines constrainHeight={constrainHeight} />
            )}

            <DialogFooter
              primaryAction="Enter to confirm"
              navigationActions={previewNavigationHint}
              cancelAction="Esc to go back"
            />
          </>
        )}

        {phase === 'memory-preview' &&
          selectedItem?.type === 'memory-patch' && (
            <>
              <Text bold>{selectedItem.memoryPatch.name}</Text>
              <Text color={theme.text.secondary}>
                Review {formatMemoryPatchSummary(selectedItem.memoryPatch)}{' '}
                before applying. Apply runs each source patch atomically;
                Dismiss removes them all.
              </Text>

              {(() => {
                // Grouping + section flattening were hoisted into the
                // `previewData` useMemo so the array identities passed into
                // ScrollableDiffViewport stay stable across re-renders.
                const groupEntries = previewData.memoryGroups ?? [];

                if (isAlternateBuffer) {
                  return (
                    <Box flexDirection="column" marginTop={1}>
                      <ScrollableDiffViewport
                        sections={previewData.memorySections ?? []}
                        width={contentWidth}
                        height={diffViewportHeight}
                        hasFocus={true}
                      />
                    </Box>
                  );
                }

                return groupEntries.map(
                  ([targetPath, { isNewFile, diffs }]) => (
                    <Box key={targetPath} flexDirection="column" marginTop={1}>
                      <Text color={theme.text.secondary} bold>
                        {targetPath}
                        {isNewFile ? ' (new file)' : ''}
                        {diffs.length > 1
                          ? ` · ${diffs.length} changes from different patches`
                          : ''}
                      </Text>
                      {diffs.map((diff, hunkIndex) => (
                        <DiffRenderer
                          key={`${targetPath}:${hunkIndex}`}
                          diffContent={diff}
                          filename={targetPath}
                          terminalWidth={contentWidth}
                          availableTerminalHeight={availablePatchEntryHeight}
                        />
                      ))}
                    </Box>
                  ),
                );
              })()}

              <Box flexDirection="column" marginTop={1}>
                <BaseSelectionList<MemoryPatchAction>
                  items={memoryPatchActionItems}
                  onSelect={handleSelectMemoryPatchAction}
                  isFocused={true}
                  showNumbers={true}
                  renderItem={(item, { titleColor }) => (
                    <Box flexDirection="column" minHeight={2}>
                      <Text color={titleColor} bold>
                        {item.value.label}
                      </Text>
                      <Text color={theme.text.secondary}>
                        {item.value.description}
                      </Text>
                    </Box>
                  )}
                />
              </Box>

              {feedback && (
                <Box marginTop={1}>
                  <Text
                    color={
                      feedback.isError
                        ? theme.status.error
                        : theme.status.success
                    }
                  >
                    {feedback.isError ? '✗ ' : '✓ '}
                    {feedback.text}
                  </Text>
                </Box>
              )}

              {!isAlternateBuffer && (
                <ShowMoreLines constrainHeight={constrainHeight} />
              )}

              <DialogFooter
                primaryAction="Enter to confirm"
                navigationActions={previewNavigationHint}
                cancelAction="Esc to go back"
              />
            </>
          )}
      </Box>
    </OverflowProvider>
  );
};
