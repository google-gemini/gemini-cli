/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OauthDisplayMessagePayload } from '@google/gemini-cli-core';

export function formatOauthDisplayMessage(
  payload: OauthDisplayMessagePayload,
): string {
  const parts = [payload.heading, '', payload.url];

  if (payload.footerLines && payload.footerLines.length > 0) {
    parts.push('', ...payload.footerLines);
  }

  return `${parts.join('\n')}\n`;
}
