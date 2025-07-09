/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { checkFilePermission } from '../services/filePermissionService.js';

interface TemplateConfig {
  [key: string]: string;
}

const templates: TemplateConfig = {
  basic: 'Hello, ${name}!\nThis is a ${type} file.',
};

export async function writeFromTemplate(
  filePath: string,
  templateName: string,
  substitutions: { [key: string]: string },
  config: unknown,
): Promise<string> {
  if (!(await checkFilePermission())) {
    throw new Error(`Write access denied for ${filePath}`);
  }

  const template = templates[templateName] || '';
  const content = Object.entries(substitutions).reduce(
    (acc, [key, value]) => acc.replace(`\${${key}}`, value),
    template,
  );

  const resolvedPath = resolve(filePath);
  await fs.writeFile(resolvedPath, content, 'utf-8');
  return `Wrote template to ${resolvedPath}`;
}
