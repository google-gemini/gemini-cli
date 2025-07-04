import * as fs from 'fs';
import * as path from 'path';
import { highlight } from 'cli-highlight';
import { checkFilePermission } from './check_file_permission';

export function highlightFile(filePath: string, config: any): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'read', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.readFile(resolvedPath, 'utf-8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(
              highlight(data, {
                language: path.extname(resolvedPath).substring(1),
              }),
            );
          }
        });
      })
      .catch(reject);
  });
}
