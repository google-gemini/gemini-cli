/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import path from 'path';

export async function loadRules(projectRoot?: string): Promise<string[]> {
  const file = path.join(projectRoot ?? process.cwd(), 'rules.json');
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data) as string[];
  } catch {
    return [];
  }
}

export async function addRule(
  rule: string,
  projectRoot?: string,
): Promise<void> {
  const file = path.join(projectRoot ?? process.cwd(), 'rules.json');
  const rules = await loadRules(projectRoot);
  rules.push(rule);
  await fs.writeFile(file, JSON.stringify(rules, null, 2));
}
