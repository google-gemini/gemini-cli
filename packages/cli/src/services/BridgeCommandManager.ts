/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandManager } from '@google/gemini-cli-core/src/commands/commandManager.js';

export class BridgeCommandManager implements CommandManager {
  private reloader?: () => void;

  setReloader(reloader: () => void) {
    this.reloader = reloader;
  }

  async reloadCommands() {
    this.reloader?.();
  }
}
