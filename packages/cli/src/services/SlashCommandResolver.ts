/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from '../ui/commands/types.js';
import type { CommandConflict } from './types.js';

/**
 * Internal registry to track commands and conflicts during resolution.
 */
class CommandRegistry {
  readonly commandMap = new Map<string, SlashCommand>();
  readonly conflictsMap = new Map<string, CommandConflict>();
  readonly firstEncounters = new Map<string, SlashCommand>();

  get finalCommands(): SlashCommand[] {
    return Array.from(this.commandMap.values());
  }

  get conflicts(): CommandConflict[] {
    return Array.from(this.conflictsMap.values());
  }
}

/**
 * Resolves name conflicts among slash commands.
 *
 * Rules:
 * 1. Built-in commands always keep the original name.
 * 2. All other types are prefixed with their source name (e.g. user.name).
 * 3. If multiple non-built-in commands conflict, all of them are renamed.
 */
export class SlashCommandResolver {
  /**
   * Orchestrates conflict resolution by applying renaming rules to ensures
   * every command has a unique name.
   */
  static resolve(allCommands: SlashCommand[]): {
    finalCommands: SlashCommand[];
    conflicts: CommandConflict[];
  } {
    const registry = new CommandRegistry();

    for (const cmd of allCommands) {
      const originalName = cmd.name;
      let finalName = originalName;

      const shouldAlwaysPrefix =
        cmd.kind === CommandKind.SKILL && !!cmd.extensionName;

      if (shouldAlwaysPrefix) {
        finalName = this.getRenamedName(
          originalName,
          this.getPrefix(cmd),
          registry.commandMap,
          cmd.kind,
        );
      } else if (registry.firstEncounters.has(originalName)) {
        // We've already seen a command with this name, so resolve the conflict.
        finalName = this.handleConflict(cmd, registry);
      } else {
        // Track the first claimant to report them as the conflict reason later.
        registry.firstEncounters.set(originalName, cmd);
      }

      // Store under final name, ensuring the command object reflects it.
      registry.commandMap.set(finalName, {
        ...cmd,
        name: finalName,
      });
    }

    return {
      finalCommands: registry.finalCommands,
      conflicts: registry.conflicts,
    };
  }

  /**
   * Resolves a name collision by deciding which command keeps the name and which is renamed.
   *
   * @param incoming The command currently being processed that has a name collision.
   * @param registry The internal state of the resolution process.
   * @returns The final name to be assigned to the `incoming` command.
   */
  private static handleConflict(
    incoming: SlashCommand,
    registry: CommandRegistry,
  ): string {
    const collidingName = incoming.name;
    const originalClaimant = registry.firstEncounters.get(collidingName)!;

    // Incoming built-in takes priority. Prefix any existing owner.
    if (incoming.kind === CommandKind.BUILT_IN) {
      this.prefixExistingCommand(collidingName, incoming, registry);
      return collidingName;
    }

    // Incoming non-built-in is renamed to its source-prefixed version.
    const renamedName = this.getRenamedName(
      incoming.name,
      this.getPrefix(incoming),
      registry.commandMap,
      incoming.kind,
    );
    this.trackConflict(
      registry.conflictsMap,
      collidingName,
      originalClaimant,
      incoming,
      renamedName,
    );

    // Prefix current owner as well if it isn't a built-in.
    this.prefixExistingCommand(collidingName, incoming, registry);

    return renamedName;
  }

  /**
   * Safely renames the command currently occupying a name in the registry.
   *
   * @param name The name of the command to prefix.
   * @param reason The incoming command that is causing the prefixing.
   * @param registry The internal state of the resolution process.
   */
  private static prefixExistingCommand(
    name: string,
    reason: SlashCommand,
    registry: CommandRegistry,
  ): void {
    const currentOwner = registry.commandMap.get(name);

    // Only non-built-in commands can be prefixed.
    if (!currentOwner || currentOwner.kind === CommandKind.BUILT_IN) {
      return;
    }

    // Determine the new name for the owner using its source prefix.
    const renamedName = this.getRenamedName(
      currentOwner.name,
      this.getPrefix(currentOwner),
      registry.commandMap,
      currentOwner.kind,
    );

    // Update the registry: remove the old name and add the owner under the new name.
    registry.commandMap.delete(name);
    const renamedOwner = { ...currentOwner, name: renamedName };
    registry.commandMap.set(renamedName, renamedOwner);

    // Record the conflict so the user can be notified of the prefixing.
    this.trackConflict(
      registry.conflictsMap,
      name,
      reason,
      currentOwner,
      renamedName,
    );
  }

  /**
   * Generates a unique name using numeric suffixes if needed.
   */
  private static getRenamedName(
    name: string,
    prefix: string | undefined,
    commandMap: Map<string, SlashCommand>,
    kind?: CommandKind,
  ): string {
    const isExtensionPrefix =
      kind === CommandKind.SKILL || kind === CommandKind.EXTENSION_FILE;
    const separator = isExtensionPrefix ? ':' : '.';
    const base = prefix ? `${prefix}${separator}${name}` : name;
    let renamedName = base;
    let suffix = 1;

    while (commandMap.has(renamedName)) {
      renamedName = `${base}${suffix}`;
      suffix++;
    }
    return renamedName;
  }

  /**
   * Returns a suitable prefix for a conflicting command.
   */
  private static getPrefix(cmd: SlashCommand): string | undefined {
    switch (cmd.kind) {
      case CommandKind.EXTENSION_FILE:
      case CommandKind.SKILL:
        return cmd.extensionName;
      case CommandKind.MCP_PROMPT:
        return cmd.mcpServerName;
      case CommandKind.USER_FILE:
        return 'user';
      case CommandKind.WORKSPACE_FILE:
        return 'workspace';
      default:
        return undefined;
    }
  }
  /**
   * Logs a conflict event.
   */
  private static trackConflict(
    conflictsMap: Map<string, CommandConflict>,
    originalName: string,
    reason: SlashCommand,
    displacedCommand: SlashCommand,
    renamedTo: string,
  ) {
    if (!conflictsMap.has(originalName)) {
      conflictsMap.set(originalName, {
        name: originalName,
        losers: [],
      });
    }

    conflictsMap.get(originalName)!.losers.push({
      command: displacedCommand,
      renamedTo,
      reason,
    });
  }
}
