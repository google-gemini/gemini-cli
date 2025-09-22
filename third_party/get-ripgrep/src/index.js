/* eslint-disable */
/**
 * @license
 * Copyright 2023 Lvce Editor
 * SPDX-License-Identifier: MIT
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const rgPath = join(
  __dirname,
  '..',
  'bin',
  `rg${process.platform === 'win32' ? '.exe' : ''}`,
)
