/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { createMockSettings } from '../../../test-utils/settings.js';
import { ToolGroupDisplay } from './ToolGroupDisplay.js';
import {
  CoreToolCallStatus,
  UPDATE_TOPIC_DISPLAY_NAME,
} from '@google/gemini-cli-core';
import type {
  HistoryItemToolDisplayGroup,
  ToolDisplayItem,
} from '../../types.js';

describe('<ToolGroupDisplay />', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createToolItem = (
    overrides: Partial<ToolDisplayItem> = {},
  ): ToolDisplayItem => ({
    status: CoreToolCallStatus.Success,
    name: 'test-tool',
    description: 'Test description',
    ...overrides,
  });

  const createHistoryItem = (
    tools: ToolDisplayItem[],
    overrides: Partial<HistoryItemToolDisplayGroup> = {},
  ): HistoryItemToolDisplayGroup => ({
    type: 'tool_display_group',
    tools,
    borderColor: 'gray',
    borderDimColor: true,
    borderTop: true,
    borderBottom: true,
    ...overrides,
  });

  const fullVerbositySettings = createMockSettings({
    ui: { errorVerbosity: 'full', compactToolOutput: false },
  });
  const compactSettings = createMockSettings({
    ui: { compactToolOutput: true },
  });

  describe('Golden Snapshots', () => {
    it('renders notices at the top (hoisting)', async () => {
      const tools = [
        createToolItem({ name: 'Tool A', format: 'box' }),
        createToolItem({
          name: UPDATE_TOPIC_DISPLAY_NAME,
          description: 'New Topic',
          format: 'notice',
        }),
      ];
      const item = createHistoryItem(tools);

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
        { settings: fullVerbositySettings },
      );

      const output = lastFrame();
      // Notice should be before Tool A
      expect(output.indexOf(UPDATE_TOPIC_DISPLAY_NAME)).toBeLessThan(
        output.indexOf('Tool A'),
      );
      expect(output).toMatchSnapshot();
    });

    it('renders in compact mode (no box borders)', async () => {
      const tools = [
        createToolItem({ name: 'Tool A' }),
        createToolItem({ name: 'Tool B' }),
      ];
      const item = createHistoryItem(tools);

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
        { settings: compactSettings },
      );

      const output = lastFrame();
      // Should not contain box drawing characters for the outer box
      expect(output).not.toContain('╭');
      expect(output).not.toContain('╰');
      expect(output).toMatchSnapshot();
    });

    it('renders in boxed mode (full verbosity)', async () => {
      const tools = [createToolItem({ name: 'Tool A' })];
      const item = createHistoryItem(tools);

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
        { settings: fullVerbositySettings },
      );

      const output = lastFrame();
      expect(output).toContain('╭');
      expect(output).toContain('╰');
      expect(output).toMatchSnapshot();
    });

    it('renders standalone notices without a box', async () => {
      const tools = [
        createToolItem({
          name: 'Notice Only',
          format: 'notice',
        }),
      ];
      const item = createHistoryItem(tools);

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
        { settings: fullVerbositySettings },
      );

      const output = lastFrame();
      expect(output).not.toContain('╭');
      expect(output).toMatchSnapshot();
    });

    it('renders error message when display info is missing', async () => {
      // Create an item that effectively has no display properties
      const tools = [
        {
          status: CoreToolCallStatus.Executing,
          originalRequestName: 'missing-tool',
        } as ToolDisplayItem,
      ];
      const item = createHistoryItem(tools);

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
      );

      const output = lastFrame();
      expect(output).toContain('Error: Tool display missing');
      expect(output).toMatchSnapshot();
    });

    it('hides tools awaiting approval (confirming)', async () => {
      const tools = [
        createToolItem({
          name: 'Confirming Tool',
          status: CoreToolCallStatus.AwaitingApproval,
        }),
      ];
      const item = createHistoryItem(tools);

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
      );

      // Should render nothing (null)
      expect(lastFrame({ allowEmpty: true })).toBe('');
    });
  });

  describe('Result Formatting', () => {
    it('renders text results with summary below', async () => {
      const tools = [
        createToolItem({
          result: { type: 'text', text: 'Detailed output' },
          resultSummary: 'Short summary',
          format: 'box',
        }),
      ];
      const item = createHistoryItem(tools);

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
        { settings: fullVerbositySettings },
      );

      const output = lastFrame();
      expect(output).toContain('Detailed output');
      expect(output).toContain('Short summary');
      // Summary should be below detailed output
      expect(output.indexOf('Detailed output')).toBeLessThan(
        output.indexOf('Short summary'),
      );
      expect(output).toMatchSnapshot();
    });

    it('renders compact tools with summary on same line', async () => {
      const tools = [
        createToolItem({
          resultSummary: 'Success summary',
          format: 'compact',
        }),
      ];
      const item = createHistoryItem(tools);

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
      );

      const output = lastFrame();
      expect(output).toContain('→ Success summary');
      expect(output).toMatchSnapshot();
    });

    it('renders placeholder for diff results', async () => {
      const tools = [
        createToolItem({
          result: {
            type: 'diff',
            beforeText: 'old',
            afterText: 'new',
            path: 'file.ts',
          },
        }),
      ];
      const item = createHistoryItem(tools);

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
        { settings: fullVerbositySettings },
      );

      const output = lastFrame();
      expect(output).toContain('[Diff Display: 3 -> 3 chars]');
      expect(output).toMatchSnapshot();
    });

    it('renders placeholder for terminal results', async () => {
      const tools = [
        createToolItem({
          result: { type: 'terminal' },
        }),
      ];
      const item = createHistoryItem(tools);

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
        { settings: fullVerbositySettings },
      );

      expect(lastFrame()).toContain('[Terminal Output]');
    });

    it('renders placeholder for agent results', async () => {
      const tools = [
        createToolItem({
          result: { type: 'agent', threadId: 'thread-123' },
        }),
      ];
      const item = createHistoryItem(tools);

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
        { settings: fullVerbositySettings },
      );

      expect(lastFrame()).toContain('[Subagent: thread-123]');
    });
  });

  describe('Border & Margin Logic', () => {
    it('forces top border on box when it follows a notice', async () => {
      const tools = [
        createToolItem({ name: 'Notice', format: 'notice' }),
        createToolItem({ name: 'Tool in Box', format: 'box' }),
      ];
      // Even if item.borderTop is false (continuing a group),
      // the box should have a top border because it follows a notice.
      const item = createHistoryItem(tools, { borderTop: false });

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
        { settings: fullVerbositySettings },
      );

      const output = lastFrame();
      expect(output).toContain('Notice');
      expect(output).toContain('╭'); // Top border for the box
      expect(output).toMatchSnapshot();
    });

    it('applies bottom margin in compact mode when group is at boundary', async () => {
      const tools = [createToolItem({ name: 'Compact Tool' })];
      const item = createHistoryItem(tools, { borderBottom: true });

      const { lastFrame } = await renderWithProviders(
        <ToolGroupDisplay item={item} />,
        { settings: compactSettings },
      );

      // This is hard to assert via string check, but ensure match snapshot
      // captures the vertical spacing.
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
