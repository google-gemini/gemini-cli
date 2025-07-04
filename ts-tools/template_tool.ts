/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function templateFile(
  filePath: string,
  templateName: string,
  substitutions: { [key: string]: string },
  config: any,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'write', config)
      .then(() => {
        const templates: { [key: string]: string } = {
          python_script: "def main():\n    print('Hello, $name')",
        };
        const template = templates[templateName];
        if (!template) {
          reject(new Error(`Template not found: ${templateName}`));
          return;
        }
        let content = template;
        for (const key in substitutions) {
          content = content.replace(`$${key}`, substitutions[key]);
        }
        const resolvedPath = path.resolve(filePath);
        fs.writeFile(resolvedPath, content, 'utf-8', (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(`Wrote template to ${filePath}`);
          }
        });
      })
      .catch(reject);
  });
}
