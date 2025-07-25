/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const CONFIG_DIR = '.gemini';

export async function readConfigFile<T extends z.ZodTypeAny>(
  fileName: string,
  schema: T,
  defaultValue: z.infer<T>,
): Promise<z.infer<T>> {
  const configPath = join(process.cwd(), CONFIG_DIR, fileName);
  try {
    const content = await readFile(configPath, 'utf-8');
    const parsedContent = JSON.parse(content);
    return schema.parse(parsedContent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultValue;
    }
    throw error;
  }
}

export async function writeConfigFile<T extends z.ZodTypeAny>(
  fileName: string,
  config: z.infer<T>,
): Promise<void> {
  const configPath = join(process.cwd(), CONFIG_DIR, fileName);
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
