import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function catFiles(filePaths: string[], config: any): Promise<string> {
  return new Promise((resolve, reject) => {
    Promise.all(filePaths.map((f) => checkFilePermission(f, 'read', config)))
      .then(() => {
        const promises = filePaths.map((p) =>
          fs.promises.readFile(path.resolve(p), 'utf-8'),
        );
        Promise.all(promises)
          .then((contents) => resolve(contents.join('\n')))
          .catch(reject);
      })
      .catch(reject);
  });
}
