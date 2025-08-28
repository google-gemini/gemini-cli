/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Options } from 'yargs';

export const locationOption: Options = {
  describe: 'The location of the extension.',
  type: 'string',
  choices: ['user', 'system'],
  default: 'user',
};
