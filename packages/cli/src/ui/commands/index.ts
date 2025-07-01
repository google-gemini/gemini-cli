/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from './types.js';
import { helpCommand } from './helpCommand.js';
import { clearCommand } from './clearCommand.js';

export const registeredCommands: Command[] = [helpCommand, clearCommand];
