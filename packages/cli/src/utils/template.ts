/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import mustache from 'mustache';

export function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return mustache.render(template, variables);
}
