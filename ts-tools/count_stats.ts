import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function countStats(filePath: string, config: any): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'read', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.readFile(resolvedPath, 'utf-8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            const lines = data.split('\n').length;
            const words = data.split(/\s+/).length;
            const chars = data.length;
            resolve(`Lines: ${lines}, Words: ${words}, Characters: ${chars}`);
          }
        });
      })
      .catch(reject);
  });
}
