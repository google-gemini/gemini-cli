/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { visualizeCommand } from './visualizeCommand.js';
import type { CommandContext } from './types.js';
import { MessageType } from '../types.js';

vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
}));

function makeContext(): CommandContext {
  return {
    invocation: { raw: '', name: 'visualize', args: '' },
    services: {
      config: null,
      settings: {} as never,
      git: undefined,
      logger: {} as never,
    },
    ui: {
      addItem: vi.fn(),
      clear: vi.fn(),
      setDebugMessage: vi.fn(),
      pendingItem: null,
      setPendingItem: vi.fn(),
      loadHistory: vi.fn(),
      toggleCorgiMode: vi.fn(),
      toggleDebugProfiler: vi.fn(),
      toggleVimEnabled: vi.fn(),
      reloadCommands: vi.fn(),
      openAgentConfigDialog: vi.fn(),
      extensionsUpdateState: new Map(),
      dispatchExtensionStateUpdate: vi.fn(),
      addConfirmUpdateExtensionRequest: vi.fn(),
      setConfirmationRequest: vi.fn(),
      removeComponent: vi.fn(),
      toggleBackgroundShell: vi.fn(),
      toggleShortcutsHelp: vi.fn(),
    },
    session: {
      stats: {} as never,
      sessionShellAllowlist: new Set(),
    },
  };
}

describe('visualizeCommand', () => {
  let ctx: CommandContext;

  beforeEach(() => {
    ctx = makeContext();
  });

  it('has the correct name and alt names', () => {
    expect(visualizeCommand.name).toBe('visualize');
    expect(visualizeCommand.altNames).toContain('viz');
    expect(visualizeCommand.altNames).toContain('diagram');
  });

  it('shows usage info when called with no args', () => {
    void visualizeCommand.action?.(ctx, '');
    expect(ctx.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: MessageType.INFO }),
    );
  });

  it('has 6 subcommands', () => {
    expect(visualizeCommand.subCommands?.length).toBe(6);
  });

  describe('flowchart subcommand', () => {
    it('submits a prompt when given a description', () => {
      const sub = visualizeCommand.subCommands!.find(
        (s) => s.name === 'flowchart',
      )!;
      const result = sub.action?.(ctx, 'user authentication flow');
      expect(result).toMatchObject({ type: 'submit_prompt' });
    });

    it('shows an error when called with no description', () => {
      const sub = visualizeCommand.subCommands!.find(
        (s) => s.name === 'flowchart',
      )!;
      void sub.action?.(ctx, '');
      expect(ctx.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.ERROR }),
      );
    });

    it('prompt includes Mermaid flowchart keyword', () => {
      const sub = visualizeCommand.subCommands!.find(
        (s) => s.name === 'flowchart',
      )!;
      const result = sub.action?.(ctx, 'CI pipeline') as {
        type: string;
        content: string;
      };
      expect(result?.content).toContain('graph TD or graph LR');
    });
  });

  describe('sequence subcommand', () => {
    it('submits a prompt with sequence diagram type', () => {
      const sub = visualizeCommand.subCommands!.find(
        (s) => s.name === 'sequence',
      )!;
      const result = sub.action?.(ctx, 'OAuth flow') as {
        type: string;
        content: string;
      };
      expect(result?.type).toBe('submit_prompt');
      expect(result?.content).toContain('sequence');
    });

    it('shows an error when called with empty args', () => {
      const sub = visualizeCommand.subCommands!.find(
        (s) => s.name === 'sequence',
      )!;
      void sub.action?.(ctx, '');
      expect(ctx.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.ERROR }),
      );
    });

    it('prompt includes the sequenceDiagram keyword', () => {
      const sub = visualizeCommand.subCommands!.find(
        (s) => s.name === 'sequence',
      )!;
      const result = sub.action?.(ctx, 'login flow') as {
        type: string;
        content: string;
      };
      expect(result?.content).toContain('sequenceDiagram');
    });
  });

  describe('class subcommand', () => {
    it('returns submit_prompt when given a description', () => {
      const sub = visualizeCommand.subCommands!.find(
        (s) => s.name === 'class',
      )!;
      const result = sub.action?.(ctx, 'e-commerce domain');
      expect(result).toMatchObject({ type: 'submit_prompt' });
    });

    it('shows an error when called with empty args', () => {
      const sub = visualizeCommand.subCommands!.find(
        (s) => s.name === 'class',
      )!;
      void sub.action?.(ctx, '');
      expect(ctx.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.ERROR }),
      );
    });

    it('prompt includes the classDiagram keyword', () => {
      const sub = visualizeCommand.subCommands!.find(
        (s) => s.name === 'class',
      )!;
      const result = sub.action?.(ctx, 'vehicle hierarchy') as {
        type: string;
        content: string;
      };
      expect(result?.content).toContain('classDiagram');
    });
  });

  describe('erd subcommand', () => {
    it('returns submit_prompt when given a description', () => {
      const sub = visualizeCommand.subCommands!.find((s) => s.name === 'erd')!;
      const result = sub.action?.(ctx, 'blog schema');
      expect(result).toMatchObject({ type: 'submit_prompt' });
    });

    it('shows an error when called with empty args', () => {
      const sub = visualizeCommand.subCommands!.find((s) => s.name === 'erd')!;
      void sub.action?.(ctx, '');
      expect(ctx.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.ERROR }),
      );
    });

    it('prompt includes the erDiagram keyword', () => {
      const sub = visualizeCommand.subCommands!.find((s) => s.name === 'erd')!;
      const result = sub.action?.(ctx, 'orders schema') as {
        type: string;
        content: string;
      };
      expect(result?.content).toContain('erDiagram');
    });
  });

  describe('deps subcommand', () => {
    it('returns submit_prompt when a dependency file is found', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({
          dependencies: { react: '^18.0.0' },
          devDependencies: { vitest: '^1.0.0' },
        }),
      );
      const sub = visualizeCommand.subCommands!.find((s) => s.name === 'deps')!;
      const result = sub.action?.(ctx, '') as { type: string; content: string };
      expect(result?.type).toBe('submit_prompt');
    });

    it('shows an error when no dependency file is found', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      const sub = visualizeCommand.subCommands!.find((s) => s.name === 'deps')!;
      void sub.action?.(ctx, '');
      expect(ctx.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.ERROR }),
      );
    });

    it('prompt content mentions "dependency"', () => {
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ dependencies: { lodash: '^4.0.0' } }),
      );
      const sub = visualizeCommand.subCommands!.find((s) => s.name === 'deps')!;
      const result = sub.action?.(ctx, '') as { type: string; content: string };
      expect(result?.content.toLowerCase()).toContain('depend');
    });
  });

  describe('git subcommand', () => {
    it('submits a prompt to generate git diagram', () => {
      const sub = visualizeCommand.subCommands!.find((s) => s.name === 'git')!;
      const result = sub.action?.(ctx, '') as { type: string; content: string };
      expect(result?.type).toBe('submit_prompt');
      expect(result?.content).toContain('git');
    });

    it('includes optional focus args in prompt', () => {
      const sub = visualizeCommand.subCommands!.find((s) => s.name === 'git')!;
      const result = sub.action?.(ctx, 'main branch') as {
        type: string;
        content: string;
      };
      expect(result?.content).toContain('Focus on:');
      expect(result?.content).toContain('main branch');
    });

    it('prompt references git log command', () => {
      const sub = visualizeCommand.subCommands!.find((s) => s.name === 'git')!;
      const result = sub.action?.(ctx, '') as { type: string; content: string };
      expect(result?.content).toContain('git log');
    });
  });
});
