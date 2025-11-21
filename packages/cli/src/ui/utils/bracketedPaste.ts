/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeToStdout } from '@google/gemini-cli-core';

const ENABLE_BRACKETED_PASTE = '\x1b[?2004h';
const DISABLE_BRACKETED_PASTE = '\x1b[?2004l';

export const enableBracketedPaste = () => {
  writeToStdout(ENABLE_BRACKETED_PASTE);
};

export const disableBracketedPaste = () => {
  writeToStdout(DISABLE_BRACKETED_PASTE);
};
