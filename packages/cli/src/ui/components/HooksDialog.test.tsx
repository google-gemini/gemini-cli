/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { act } from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { HooksDialog, type HookEntry } from './HooksDialog.js';

describe('HooksDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockHook = (
    name: string,
    eventName: string,
    enabled: boolean,
    options?: Partial<HookEntry>,
  ): HookEntry => ({
    config: {
      name,
      command: `run-${name}`,
      type: 'command',
      description: `Test hook: ${name}`,
      ...options?.config,
    },
    source: options?.source ?? '/mock/path/GEMINI.md',
    eventName,
    enabled,
    ...options,
  });

  it('should render the dialog with border', () => {
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={[]} onClose={vi.fn()} />,
    );

    // Dialog should render with content (border is rendered)
    expect(lastFrame()).toBeDefined();
  });

  it('should display "No hooks configured" when hooks array is empty', () => {
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={[]} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('No hooks configured.');
  });

  it('should display security warning when hooks are present', () => {
    const hooks = [createMockHook('test-hook', 'before-tool', true)];
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={hooks} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('Security Warning');
    expect(lastFrame()).toContain(
      'Hooks can execute arbitrary commands on your system',
    );
  });

  it('should display learn more link when hooks are present', () => {
    const hooks = [createMockHook('test-hook', 'before-tool', true)];
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={hooks} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('Learn more:');
    expect(lastFrame()).toContain('https://geminicli.com/docs/hooks');
  });

  it('should display hooks grouped by event name', () => {
    const hooks = [
      createMockHook('hook1', 'before-tool', true),
      createMockHook('hook2', 'before-tool', false),
      createMockHook('hook3', 'after-agent', true),
    ];
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={hooks} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('before-tool');
    expect(lastFrame()).toContain('after-agent');
    expect(lastFrame()).toContain('hook1');
    expect(lastFrame()).toContain('hook2');
    expect(lastFrame()).toContain('hook3');
  });

  it('should display hook status as enabled or disabled', () => {
    const hooks = [
      createMockHook('enabled-hook', 'before-tool', true),
      createMockHook('disabled-hook', 'before-tool', false),
    ];
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={hooks} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('[enabled]');
    expect(lastFrame()).toContain('[disabled]');
  });

  it('should display hook description if available', () => {
    const hooks = [
      createMockHook('my-hook', 'before-tool', true, {
        config: {
          name: 'my-hook',
          type: 'command',
          description: 'This is my custom hook description',
        },
      }),
    ];
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={hooks} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('This is my custom hook description');
  });

  it('should display hook source', () => {
    const hooks = [
      createMockHook('my-hook', 'before-tool', true, {
        source: '/path/to/config/GEMINI.md',
      }),
    ];
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={hooks} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('Source: /path/to/config/GEMINI.md');
  });

  it('should display tips for enable/disable commands', () => {
    const hooks = [createMockHook('test-hook', 'before-tool', true)];
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={hooks} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('/hooks enable');
    expect(lastFrame()).toContain('/hooks disable');
    expect(lastFrame()).toContain('/hooks enable-all');
    expect(lastFrame()).toContain('/hooks disable-all');
  });

  it('should call onClose when escape key is pressed', () => {
    const onClose = vi.fn();
    const { stdin } = renderWithProviders(
      <HooksDialog hooks={[]} onClose={onClose} />,
    );

    act(() => {
      // Send kitty escape key sequence
      stdin.write('\u001b[27u');
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should display matcher info if hook has a matcher', () => {
    const hooks = [
      createMockHook('my-hook', 'before-tool', true, {
        matcher: 'shell_exec',
      }),
    ];
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={hooks} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('Matcher: shell_exec');
  });

  it('should display sequential info if hook is sequential', () => {
    const hooks = [
      createMockHook('my-hook', 'before-tool', true, {
        sequential: true,
      }),
    ];
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={hooks} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('Sequential');
  });

  it('should display timeout info if hook has a timeout', () => {
    const hooks = [
      createMockHook('my-hook', 'before-tool', true, {
        config: {
          name: 'my-hook',
          type: 'command',
          timeout: 30,
        },
      }),
    ];
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={hooks} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('Timeout: 30s');
  });

  it('should use command as hook name when name is not provided', () => {
    const hooks: HookEntry[] = [
      {
        config: {
          command: 'echo hello',
          type: 'command',
        },
        source: '/mock/path',
        eventName: 'before-tool',
        enabled: true,
      },
    ];
    const { lastFrame } = renderWithProviders(
      <HooksDialog hooks={hooks} onClose={vi.fn()} />,
    );

    expect(lastFrame()).toContain('echo hello');
  });

  describe('scrolling behavior', () => {
    const createManyHooks = (count: number): HookEntry[] =>
      Array.from({ length: count }, (_, i) =>
        createMockHook(`hook-${i + 1}`, `event-${(i % 3) + 1}`, i % 2 === 0),
      );

    it('should not show scroll indicators when hooks fit within maxVisibleHooks', () => {
      const hooks = [
        createMockHook('hook1', 'before-tool', true),
        createMockHook('hook2', 'after-tool', false),
      ];
      const { lastFrame } = renderWithProviders(
        <HooksDialog hooks={hooks} onClose={vi.fn()} maxVisibleHooks={10} />,
      );

      expect(lastFrame()).not.toContain('▲');
      expect(lastFrame()).not.toContain('▼');
    });

    it('should show scroll down indicator when there are more hooks than maxVisibleHooks', () => {
      const hooks = createManyHooks(15);
      const { lastFrame } = renderWithProviders(
        <HooksDialog hooks={hooks} onClose={vi.fn()} maxVisibleHooks={5} />,
      );

      expect(lastFrame()).toContain('▼');
    });

    it('should show scroll indicators when scrolling is needed', () => {
      const hooks = createManyHooks(15);
      const { lastFrame } = renderWithProviders(
        <HooksDialog hooks={hooks} onClose={vi.fn()} maxVisibleHooks={5} />,
      );

      // Should show down scroll indicator
      expect(lastFrame()).toContain('▼');
    });

    it('should scroll down when down arrow is pressed', () => {
      const hooks = createManyHooks(15);
      const { lastFrame, stdin } = renderWithProviders(
        <HooksDialog hooks={hooks} onClose={vi.fn()} maxVisibleHooks={5} />,
      );

      // Initially should not show up indicator
      expect(lastFrame()).not.toContain('▲');

      // Press down arrow
      act(() => {
        stdin.write('\u001b[B'); // Down arrow
      });

      // Should now show up indicator after scrolling down
      expect(lastFrame()).toContain('▲');
    });

    it('should scroll up when up arrow is pressed after scrolling down', () => {
      const hooks = createManyHooks(15);
      const { lastFrame, stdin } = renderWithProviders(
        <HooksDialog hooks={hooks} onClose={vi.fn()} maxVisibleHooks={5} />,
      );

      // Scroll down first
      act(() => {
        stdin.write('\u001b[B'); // Down arrow
        stdin.write('\u001b[B'); // Down arrow
      });

      // Should show up indicator
      expect(lastFrame()).toContain('▲');

      // Now scroll up
      act(() => {
        stdin.write('\u001b[A'); // Up arrow
      });

      // Should still show up indicator (scrolled down once)
      expect(lastFrame()).toContain('▲');
    });

    it('should show scroll up indicator when scrolled down', () => {
      const hooks = createManyHooks(15);
      const { lastFrame, stdin } = renderWithProviders(
        <HooksDialog hooks={hooks} onClose={vi.fn()} maxVisibleHooks={5} />,
      );

      // Initially no up indicator
      expect(lastFrame()).not.toContain('▲');

      // Scroll down
      act(() => {
        stdin.write('\u001b[B'); // Down arrow
      });

      // Should now show up indicator
      expect(lastFrame()).toContain('▲');
    });

    it('should not scroll beyond the end', () => {
      const hooks = createManyHooks(10);
      const { lastFrame, stdin } = renderWithProviders(
        <HooksDialog hooks={hooks} onClose={vi.fn()} maxVisibleHooks={5} />,
      );

      // Scroll down many times
      act(() => {
        for (let i = 0; i < 20; i++) {
          stdin.write('\u001b[B'); // Down arrow
        }
      });

      // Should be at the end, not beyond
      const frame = lastFrame();
      expect(frame).toContain('▲');
      // At the end, down indicator should be hidden
      expect(frame).not.toContain('▼');
    });

    it('should not scroll above the beginning', () => {
      const hooks = createManyHooks(10);
      const { lastFrame, stdin } = renderWithProviders(
        <HooksDialog hooks={hooks} onClose={vi.fn()} maxVisibleHooks={5} />,
      );

      // Try to scroll up when already at top
      act(() => {
        stdin.write('\u001b[A'); // Up arrow
      });

      // Should still be at top - no up indicator
      expect(lastFrame()).not.toContain('▲');
      // But should still show down indicator
      expect(lastFrame()).toContain('▼');
    });
  });
});
