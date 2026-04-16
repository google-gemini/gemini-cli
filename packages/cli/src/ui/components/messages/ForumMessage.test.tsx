/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import {
  ForumActivityMessage,
  ForumAgentMessage,
  ForumFinalMessage,
  ForumSystemMessage,
  ForumUserMessage,
} from './ForumMessage.js';

describe('ForumSystemMessage', () => {
  it('renders the text centered between horizontal rules', async () => {
    const renderResult = await renderWithProviders(
      <ForumSystemMessage
        text="Forum investigators started: A, B, C."
        terminalWidth={80}
      />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain('Forum investigators started: A, B, C.');
    // System messages are decorated with the rule character on both sides.
    expect(output).toMatch(/─+\s+Forum investigators started:.*─+/);
    // No bracketed prefix label that would make it look like a sender.
    expect(output).not.toContain('[forum]');
    renderResult.unmount();
  });
});

describe('ForumUserMessage', () => {
  it('shows the task label when isTask is true', async () => {
    const renderResult = await renderWithProviders(
      <ForumUserMessage
        text="review changes on this branch"
        isTask
        terminalWidth={80}
      />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain('You (task)');
    expect(output).toContain('review changes on this branch');
    renderResult.unmount();
  });

  it('shows the steer label for follow-up messages', async () => {
    const renderResult = await renderWithProviders(
      <ForumUserMessage
        text="also check the new tests"
        isTask={false}
        terminalWidth={80}
      />,
    );
    await renderResult.waitUntilReady();

    expect(renderResult.lastFrame()).toContain('You (steer)');
    renderResult.unmount();
  });
});

describe('ForumAgentMessage', () => {
  it('renders the speaker name and body with a left rule', async () => {
    const renderResult = await renderWithProviders(
      <ForumAgentMessage
        label="Confucius (Nitpicker)"
        memberId="confucius"
        text="The naming of `mapper.applyEvent` is good."
        terminalWidth={80}
      />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain('● Confucius (Nitpicker)');
    expect(output).toContain('│');
    expect(output).toContain('mapper.applyEvent');
    renderResult.unmount();
  });

  it('assigns the same color to repeated posts from the same memberId', async () => {
    const first = await renderWithProviders(
      <ForumAgentMessage
        label="Plato"
        memberId="plato"
        text="round 1"
        terminalWidth={60}
      />,
    );
    await first.waitUntilReady();
    const firstFrame = first.lastFrame();
    first.unmount();

    const second = await renderWithProviders(
      <ForumAgentMessage
        label="Plato"
        memberId="plato"
        text="round 2"
        terminalWidth={60}
      />,
    );
    await second.waitUntilReady();
    const secondFrame = second.lastFrame();
    second.unmount();

    // Same memberId must produce identical ANSI sequences for the header line.
    const firstHeader = firstFrame.split('\n').find((l) => l.includes('●'));
    const secondHeader = secondFrame.split('\n').find((l) => l.includes('●'));
    expect(firstHeader).toBeDefined();
    expect(secondHeader).toBeDefined();
    expect(firstHeader).toBe(secondHeader);
  });
});

describe('ForumFinalMessage', () => {
  it('renders the synthesis rule and the flag glyph', async () => {
    const renderResult = await renderWithProviders(
      <ForumFinalMessage
        label="Hegel (Lead)"
        memberId="lead"
        text="Verdict: Approve"
        terminalWidth={80}
      />,
    );
    await renderResult.waitUntilReady();

    const output = renderResult.lastFrame();
    expect(output).toContain('final synthesis');
    expect(output).toContain('⚑');
    expect(output).toContain('Hegel (Lead)');
    expect(output).toContain('Verdict: Approve');
    renderResult.unmount();
  });
});

describe('ForumActivityMessage', () => {
  describe('collapsed (default)', () => {
    it('shows a generic thinking placeholder for thinking activity', async () => {
      const renderResult = await renderWithProviders(
        <ForumActivityMessage
          label="Diogenes"
          activityKind="thinking"
          text="reading packages/core/src/forum/types.ts"
          terminalWidth={80}
        />,
        { uiState: { constrainHeight: true } },
      );
      await renderResult.waitUntilReady();

      const output = renderResult.lastFrame();
      expect(output).toContain('∴');
      expect(output).toContain('Diogenes thinking…');
      // Detail text must not leak when collapsed.
      expect(output).not.toContain('packages/core/src/forum/types.ts');
      renderResult.unmount();
    });

    it('hides tool detail and uses the placeholder glyph for tool activity', async () => {
      const renderResult = await renderWithProviders(
        <ForumActivityMessage
          label="Curie"
          activityKind="tool"
          text={'using run_shell_command(command="git --no-pager diff")'}
          terminalWidth={80}
        />,
        { uiState: { constrainHeight: true } },
      );
      await renderResult.waitUntilReady();
      const output = renderResult.lastFrame();
      expect(output).toContain('Curie thinking…');
      expect(output).not.toContain('run_shell_command');
      expect(output).not.toContain('⚙');
      renderResult.unmount();
    });

    it('hides error detail and uses the placeholder glyph for error activity', async () => {
      const renderResult = await renderWithProviders(
        <ForumActivityMessage
          label="Curie"
          activityKind="error"
          text="something blew up"
          terminalWidth={80}
        />,
        { uiState: { constrainHeight: true } },
      );
      await renderResult.waitUntilReady();
      const output = renderResult.lastFrame();
      expect(output).toContain('Curie thinking…');
      expect(output).not.toContain('⚠');
      expect(output).not.toContain('something blew up');
      renderResult.unmount();
    });
  });

  describe('expanded (Ctrl+O pressed)', () => {
    it('renders thinking activities on a single dim line', async () => {
      const renderResult = await renderWithProviders(
        <ForumActivityMessage
          label="Diogenes"
          activityKind="thinking"
          text="reading packages/core/src/forum/types.ts"
          terminalWidth={80}
        />,
        { uiState: { constrainHeight: false } },
      );
      await renderResult.waitUntilReady();

      const output = renderResult.lastFrame();
      expect(output).toContain('∴');
      expect(output).toContain('Diogenes');
      expect(output).toContain('reading');
      // Activity output is a single visual line (ignore trailing newline).
      expect(output.split('\n').filter((line) => line.length > 0).length).toBe(
        1,
      );
      renderResult.unmount();
    });

    it('uses the gear glyph for tool activities', async () => {
      const renderResult = await renderWithProviders(
        <ForumActivityMessage
          label="Curie"
          activityKind="tool"
          text="using run_shell_command"
          terminalWidth={80}
        />,
        { uiState: { constrainHeight: false } },
      );
      await renderResult.waitUntilReady();
      expect(renderResult.lastFrame()).toContain('⚙');
      renderResult.unmount();
    });

    it('uses the warning glyph for error activities', async () => {
      const renderResult = await renderWithProviders(
        <ForumActivityMessage
          label="Curie"
          activityKind="error"
          text="something blew up"
          terminalWidth={80}
        />,
        { uiState: { constrainHeight: false } },
      );
      await renderResult.waitUntilReady();
      expect(renderResult.lastFrame()).toContain('⚠');
      renderResult.unmount();
    });
  });
});
