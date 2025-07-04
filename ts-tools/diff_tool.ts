import * as fs from 'fs';
import * as path from 'path';
import * as diff from 'diff';
import { checkFilePermission } from './check_file_permission';

export function diffFiles(
  file1Path: string,
  file2Path: string,
  config: any,
): Promise<string> {
  return new Promise((resolve, reject) => {
    Promise.all([
      checkFilePermission(file1Path, 'read', config),
      checkFilePermission(file2Path, 'read', config),
    ])
      .then(() => {
        const resolved1 = path.resolve(file1Path);
        const resolved2 = path.resolve(file2Path);
        Promise.all([
          fs.promises.readFile(resolved1, 'utf-8'),
          fs.promises.readFile(resolved2, 'utf-8'),
        ])
          .then(([data1, data2]) => {
            const diffResult = diff.createPatch(file1Path, data1, data2);
            resolve(diffResult);
          })
          .catch(reject);
      })
      .catch(reject);
  });
}
