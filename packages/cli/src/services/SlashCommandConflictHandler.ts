/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  coreEvents,
  CoreEvent,
  type SlashCommandConflictsPayload,
} from '@google/gemini-cli-core';

export class SlashCommandConflictHandler {
  private notifiedConflicts = new Set<string>();

  constructor() {
    this.handleConflicts = this.handleConflicts.bind(this);
  }

  start() {
    coreEvents.on(CoreEvent.SlashCommandConflicts, this.handleConflicts);
  }

  stop() {
    coreEvents.off(CoreEvent.SlashCommandConflicts, this.handleConflicts);
  }

  private handleConflicts(payload: SlashCommandConflictsPayload) {
    const newConflicts = payload.conflicts.filter((c) => {
      const key = `${c.name}:${c.loserExtensionName}`;
      if (this.notifiedConflicts.has(key)) {
        return false;
      }
      this.notifiedConflicts.add(key);
      return true;
    });

    if (newConflicts.length > 0) {
      const conflictMessages = newConflicts
        .map((c) => {
          const winnerSource = c.winnerExtensionName
            ? `extension '${c.winnerExtensionName}'`
            : 'an existing command';
          return `- Command '/${c.name}' from extension '${c.loserExtensionName}' was renamed to '/${c.renamedTo}' because it conflicts with ${winnerSource}.`;
        })
        .join('\n');

      coreEvents.emitFeedback(
        'info',
        `Command conflicts detected:\n${conflictMessages}`,
      );
    }
  }
}
