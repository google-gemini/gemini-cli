/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { PoliciesDialog } from './PoliciesDialog.js';
import { PolicyDecision } from '@google/gemini-cli-core';
import type { PolicyRule } from '@google/gemini-cli-core';

function makeRule(
  overrides: Partial<PolicyRule> & { decision: PolicyDecision },
): PolicyRule {
  return {
    toolName: undefined,
    priority: 0,
    source: undefined,
    argsPattern: undefined,
    constraintDisplay: undefined,
    ...overrides,
  } as PolicyRule;
}

// Realistic user/workspace/extension policies (default rules are filtered
// out before reaching the dialog — see policiesCommand.ts).
const ALLOW_RULES: PolicyRule[] = [
  makeRule({
    decision: PolicyDecision.ALLOW,
    toolName: 'run_shell_command',
    priority: 4.1,
    source: 'User: allowed-tools.toml',
    constraintDisplay: 'git show*',
  }),
  makeRule({
    decision: PolicyDecision.ALLOW,
    toolName: 'run_shell_command',
    priority: 4.1,
    source: 'User: allowed-tools.toml',
    constraintDisplay: 'git diff*',
  }),
  makeRule({
    decision: PolicyDecision.ALLOW,
    toolName: 'run_shell_command',
    priority: 4.0,
    source: 'Workspace: .gemini/settings.json',
    constraintDisplay: 'npm test*',
  }),
];

const ASK_RULES: PolicyRule[] = [
  makeRule({
    decision: PolicyDecision.ASK_USER,
    toolName: 'write_file',
    priority: 3,
    source: 'Workspace: .gemini/policies/write-guard.toml',
  }),
  makeRule({
    decision: PolicyDecision.ASK_USER,
    toolName: 'run_shell_command',
    priority: 2,
    source: 'Workspace: .gemini/policies/shell.toml',
  }),
];

const DENY_RULES: PolicyRule[] = [
  makeRule({
    decision: PolicyDecision.DENY,
    toolName: 'run_shell_command',
    priority: 10,
    source: 'Admin: admin-policies.toml',
    constraintDisplay: 'rm -rf*',
  }),
];

const ALL_RULES = [...ALLOW_RULES, ...ASK_RULES, ...DENY_RULES];

const TOOL_DISPLAY_NAMES = new Map([
  ['run_shell_command', 'Shell'],
  ['write_file', 'WriteFile'],
]);

describe('PoliciesDialog', () => {
  let onClose: () => void;

  beforeEach(() => {
    onClose = vi.fn();
  });

  it('renders with Allow tab active by default', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={ALL_RULES}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
    expect(output).toContain('Policies');
    expect(output).toContain('Allow');
    // Should show resolved display names, not internal names
    expect(output).toContain('Shell');
    expect(output).not.toContain('run_shell_command');
  });

  it('shows formatted shell command constraints', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={ALL_RULES}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('git show*');
    expect(output).toContain('git diff*');
    expect(output).toContain('npm test*');
  });

  it('displays policy source on each item', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={ALL_RULES}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('User: allowed-tools.toml');
    expect(output).toContain('Workspace: .gemini/settings.json');
  });

  it('displays correct count for Allow tab', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={ALL_RULES}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();
    expect(lastFrame()).toContain('3 Allow policies');
  });

  it('switches to Ask tab with right arrow', async () => {
    const { stdin, lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={ALL_RULES}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();

    act(() => {
      stdin.write('\x1B[C'); // Right arrow
    });

    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('WriteFile');
      expect(output).toContain('2 Ask policies');
    });
  });

  it('switches to Deny tab and shows deny rules', async () => {
    const { stdin, lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={ALL_RULES}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();

    // Right arrow twice: Allow → Ask → Deny
    act(() => {
      stdin.write('\x1B[C');
    });
    act(() => {
      stdin.write('\x1B[C');
    });

    await waitFor(() => {
      const output = lastFrame();
      expect(output).toContain('rm -rf*');
      expect(output).toContain('Admin: admin-policies.toml');
      expect(output).toContain('1 Deny policy');
    });
  });

  it('wraps tabs with left arrow from first tab', async () => {
    const { stdin, lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={ALL_RULES}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();

    // Left from Allow wraps to Deny
    act(() => {
      stdin.write('\x1B[D');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('1 Deny policy');
    });
  });

  it('shows empty state when a tab has no rules', async () => {
    // Only allow rules — Ask and Deny tabs will be empty
    const { stdin, lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={ALLOW_RULES}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();

    // Navigate to Ask tab
    act(() => {
      stdin.write('\x1B[C');
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('No ask policies.');
    });
  });

  it('navigates list items with up/down arrows', async () => {
    const { stdin, lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={ALL_RULES}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();
    // First item is active (highest priority first)
    expect(lastFrame()).toContain('●');

    // Move down
    act(() => {
      stdin.write('\x1B[B');
    });

    await waitFor(() => {
      // Active indicator should still be present on a different item
      expect(lastFrame()).toContain('●');
    });
  });

  it('closes on Escape when search is empty', async () => {
    const { stdin } = await renderWithProviders(
      <PoliciesDialog
        rules={ALL_RULES}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    act(() => {
      stdin.write('\x1B');
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows "all tools" for wildcard rules (no toolName)', async () => {
    const wildcardRule = makeRule({
      decision: PolicyDecision.ALLOW,
      priority: 1,
      source: 'Workspace: .gemini/policies/global.toml',
    });

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={[wildcardRule]}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();
    expect(lastFrame()).toContain('all tools');
  });

  it('falls back to internal name for unmapped tools (e.g. MCP)', async () => {
    const mcpRule = makeRule({
      decision: PolicyDecision.ALLOW,
      toolName: 'mcp_my-server_search',
      priority: 5,
      source: 'User: mcp-policies.toml',
    });

    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={[mcpRule]}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();
    // No display name mapping exists, so internal name is shown
    expect(lastFrame()).toContain('mcp_my-server_search');
  });

  it('renders with no rules at all (empty allow tab)', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={[]}
        toolDisplayNames={new Map()}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();
    expect(lastFrame()).toContain('No allow policies.');
  });

  it('sorts rules by priority descending within a tab', async () => {
    // All three allow rules have priorities 4.1, 4.1, 4.0
    // The 4.1 rules (git show, git diff) should appear before 4.0 (npm test)
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <PoliciesDialog
        rules={ALL_RULES}
        toolDisplayNames={TOOL_DISPLAY_NAMES}
        onClose={onClose}
      />,
      { width: 80 },
    );

    await waitUntilReady();
    const output = lastFrame();
    const gitShowIdx = output.indexOf('git show*');
    const npmTestIdx = output.indexOf('npm test*');
    expect(gitShowIdx).toBeLessThan(npmTestIdx);
  });
});
