/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Chalk } from 'chalk';

const chalk = new Chalk();

export const print = {
  info: (message: string) => console.log(chalk.blue(message)),
  success: (message: string) => console.log(chalk.green(message)),
  error: (message: string) => console.error(chalk.red(message)),
  warn: (message: string) => console.warn(chalk.yellow(message)),
};
