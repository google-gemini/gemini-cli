/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { highlight } from 'cli-highlight';
import fs from 'fs';

const code = fs.readFileSync(process.argv[2], 'utf-8');

const highlightedCode = highlight(code, {
  language: process.argv[3],
  ignoreIllegals: true,
});

console.log(highlightedCode);
