/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export * from '@google/gemini-cli-test-utils';
export { normalizePath } from '@google/gemini-cli-test-utils';

export const skipFlaky = !process.env['RUN_FLAKY_INTEGRATION'];
