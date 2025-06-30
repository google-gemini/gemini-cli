/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';

declare const require: NodeJS.Require;
const packageJsonPath = require.resolve('@google/gemini-cli-core/package.json');
const packageRoot = path.dirname(packageJsonPath);

const binaryName = process.platform === 'win32' ? 'fd.exe' : 'fd';
export const fdPath = path.join(packageRoot, 'dist', 'bin', binaryName);
