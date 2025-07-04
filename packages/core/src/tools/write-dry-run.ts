

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { checkFilePermission } from '../services/filePermissionService';

interface DryRunConfig {
  dryRun?: boolean;
}

export async function writeDryRun(
  filePath: string,
  content: string,
  dryRun: boolean,
  config: DryRunConfig
): Promise<string> {
  if (!(await checkFilePermission(filePath, 'write', config))) {
    throw new Error(`Write access denied for ${filePath}`);
  }

  const resolvedPath = resolve(filePath);

  if (dryRun) {
    return `[Dry Run] Would write to ${resolvedPath}:\n${content}`;
  }

  await fs.writeFile(resolvedPath, content, 'utf-8');
  return `Wrote content to ${resolvedPath}`;
}

