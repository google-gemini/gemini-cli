/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const IS_TMUX = Boolean(process.env['TMUX']);
export const IS_DUMB_TERM = (process.env['TERM'] || '') === 'dumb';
