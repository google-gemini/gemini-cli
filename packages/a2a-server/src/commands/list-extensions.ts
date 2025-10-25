/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { listExtensions, type Config } from '@google/gemini-cli-core';
import type { Command } from './command-registry.js';

export class ListExtensionsCommand implements Command {
  readonly names = ['extensions', 'extensions list'];

  async execute(config: Config, _: string[]): Promise<unknown> {
    return listExtensions(config);
  }
}
