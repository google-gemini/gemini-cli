import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function statFile(filePath: string, config: any): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'read', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.stat(resolvedPath, (err, stats) => {
          if (err) {
            reject(err);
          } else {
            resolve(
              `File: ${resolvedPath}\nSize: ${stats.size} bytes\nModified: ${stats.mtime.toISOString()}`,
            );
          }
        });
      })
      .catch(reject);
  });
}
