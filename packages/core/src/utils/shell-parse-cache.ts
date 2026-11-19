/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface ParsedCommandDetail {
  name: string;
  text: string;
  startIndex: number;
  args?: string[];
}

export interface CommandParseResult {
  details: ParsedCommandDetail[];
  hasError: boolean;
  hasRedirection?: boolean;
  hasCommandSubstitution?: boolean;
}

/**
 * Scoped cache for shell command AST parse results within a single policy
 * evaluation or ShellToolInvocation lifecycle.
 *
 * Avoids redundant external PowerShell process spawns across policy validation,
 * confirmation detail building, taint checks, and execution without introducing
 * a process-wide cache.
 */
export class CommandParseCache {
  private readonly completed = new Map<string, CommandParseResult | null>();
  private readonly inFlight = new Map<
    string,
    Promise<CommandParseResult | null>
  >();

  private makeKey(executable: string, command: string): string {
    return `${executable}\0${command}`;
  }

  hasCompleted(executable: string, command: string): boolean {
    return this.completed.has(this.makeKey(executable, command));
  }

  getCompleted(
    executable: string,
    command: string,
  ): CommandParseResult | null | undefined {
    return this.completed.get(this.makeKey(executable, command));
  }

  setCompleted(
    executable: string,
    command: string,
    result: CommandParseResult | null,
  ): void {
    this.completed.set(this.makeKey(executable, command), result);
  }

  getInFlight(
    executable: string,
    command: string,
  ): Promise<CommandParseResult | null> | undefined {
    return this.inFlight.get(this.makeKey(executable, command));
  }

  trackInFlight(
    executable: string,
    command: string,
    promise: Promise<CommandParseResult | null>,
  ): Promise<CommandParseResult | null> {
    const key = this.makeKey(executable, command);
    this.inFlight.set(key, promise);
    void promise.finally(() => {
      if (this.inFlight.get(key) === promise) {
        this.inFlight.delete(key);
      }
    });
    return promise;
  }
}

const commandParseCacheStorage = new AsyncLocalStorage<CommandParseCache>();

export function getActiveCommandParseCache(): CommandParseCache | undefined {
  return commandParseCacheStorage.getStore();
}

export function runWithCommandParseCache<T>(
  fn: (cache: CommandParseCache) => T,
  cache?: CommandParseCache,
): T {
  const targetCache =
    cache ?? commandParseCacheStorage.getStore() ?? new CommandParseCache();
  if (commandParseCacheStorage.getStore() === targetCache) {
    return fn(targetCache);
  }
  return commandParseCacheStorage.run(targetCache, () => fn(targetCache));
}
