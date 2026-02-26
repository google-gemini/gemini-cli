/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isSlashCommand } from './commandUtils.js';

const RESTART_REQUIRED_ALLOWED_COMMANDS = new Set(['/about', '/help', '/quit']);

export const isCommandAllowedDuringRestart = (query: string): boolean => {
  if (!isSlashCommand(query)) {
    return false;
  }

  const [commandName] = query.split(/\s+/, 1);
  return (
    commandName !== undefined &&
    RESTART_REQUIRED_ALLOWED_COMMANDS.has(commandName.toLowerCase())
  );
};

export const shouldBlockPromptForRestart = (
  query: string,
  restartRequired: boolean,
): boolean => restartRequired && !isCommandAllowedDuringRestart(query.trim());
