import { promises as fs } from 'fs';
import { resolve } from 'path';
import { checkFilePermission } from '../services/filePermissionService';

export async function wcFile(
  filePath: string,
  config: unknown
): Promise<string> {
  if (!(await checkFilePermission(filePath, 'read', config))) {
    throw new Error(`Read access denied for ${filePath}`);
  }

  const resolvedPath = resolve(filePath);
  const stats = await fs.stat(resolvedPath);

  if (!stats.isFile()) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const content = await fs.readFile(resolvedPath, 'utf-8');
  const lines = content.split('\n').length;
  const words = content.split(/\s+/).filter(Boolean).length;
  const chars = content.length;

  return `${lines} ${words} ${chars} ${resolvedPath}`;
}