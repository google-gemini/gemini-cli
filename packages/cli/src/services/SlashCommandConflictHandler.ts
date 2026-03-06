/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  coreEvents,
  CoreEvent,
  type SlashCommandConflictsPayload,
  type SlashCommandConflict,
} from '@google/gemini-cli-core';
import { CommandKind } from '../ui/commands/types.js';

/**
 * Handles slash command conflict events and provides user feedback.
 *
 * This handler batches multiple conflict events into a single notification
 * block per command name to avoid UI clutter during startup or incremental loading.
 */
export class SlashCommandConflictHandler {
  private notifiedConflicts = new Set<string>();
  private pendingConflicts: SlashCommandConflict[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.handleConflicts = this.handleConflicts.bind(this);
  }

  start() {
    coreEvents.on(CoreEvent.SlashCommandConflicts, this.handleConflicts);
  }

  stop() {
    coreEvents.off(CoreEvent.SlashCommandConflicts, this.handleConflicts);
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
  }

  private handleConflicts(payload: SlashCommandConflictsPayload) {
    const newConflicts = payload.conflicts.filter((c) => {
      // Use a unique key to prevent duplicate notifications for the same conflict
      const sourceId =
        c.loserExtensionName || c.loserMcpServerName || c.loserKind;
      const key = `${c.name}:${sourceId}:${c.renamedTo}`;
      if (this.notifiedConflicts.has(key)) {
        return false;
      }
      this.notifiedConflicts.add(key);
      return true;
    });

    if (newConflicts.length > 0) {
      this.pendingConflicts.push(...newConflicts);
      this.scheduleFlush();
    }
  }

  private scheduleFlush() {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    // Use a trailing debounce to capture staggered reloads during startup
    this.flushTimeout = setTimeout(() => this.flush(), 500);
  }

  private flush() {
    this.flushTimeout = null;
    const conflicts = [...this.pendingConflicts];
    this.pendingConflicts = [];

    if (conflicts.length === 0) {
      return;
    }

    // Group conflicts by their original command name
    const grouped = new Map<string, SlashCommandConflict[]>();
    for (const c of conflicts) {
      const list = grouped.get(c.name) ?? [];
      list.push(c);
      grouped.set(c.name, list);
    }

    for (const [name, commandConflicts] of grouped) {
      if (commandConflicts.length > 1) {
        this.emitGroupedFeedback(name, commandConflicts);
      } else {
        this.emitSingleFeedback(commandConflicts[0]);
      }
    }
  }

  /**
   * Emits a grouped notification for multiple conflicts sharing the same name.
   */
  private emitGroupedFeedback(
    name: string,
    conflicts: SlashCommandConflict[],
  ): void {
    const messages = conflicts
      .map((c) => {
        const source = this.getSourceDescription(
          c.loserExtensionName,
          c.loserKind,
          c.loserMcpServerName,
        );
        return `- ${this.capitalize(source)} '/${c.name}' was renamed to '/${c.renamedTo}'`;
      })
      .join('\n');

    coreEvents.emitFeedback(
      'info',
      `Conflicts detected for command '/${name}':\n${messages}`,
    );
  }

  /**
   * Emits a descriptive notification for a single command conflict.
   */
  private emitSingleFeedback(c: SlashCommandConflict): void {
    const loserSource = this.getSourceDescription(
      c.loserExtensionName,
      c.loserKind,
      c.loserMcpServerName,
    );
    const winnerSource = this.getSourceDescription(
      c.winnerExtensionName,
      c.winnerKind,
      c.winnerMcpServerName,
    );

    coreEvents.emitFeedback(
      'info',
      `${this.capitalize(loserSource)} '/${c.name}' was renamed to '/${c.renamedTo}' because it conflicts with ${winnerSource}.`,
    );
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /**
   * Returns a human-readable description of a command's source.
   */
  private getSourceDescription(
    extensionName?: string,
    kind?: string,
    mcpServerName?: string,
  ): string {
    switch (kind) {
      case CommandKind.EXTENSION_FILE:
        return extensionName
          ? `extension '${extensionName}' command`
          : 'extension command';
      case CommandKind.MCP_PROMPT:
        return mcpServerName
          ? `MCP server '${mcpServerName}' command`
          : 'MCP server command';
      case CommandKind.USER_FILE:
        return 'user command';
      case CommandKind.WORKSPACE_FILE:
        return 'workspace command';
      case CommandKind.BUILT_IN:
        return 'built-in command';
      default:
        return 'existing command';
    }
  }
}
