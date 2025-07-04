import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function trFile(
  filePath: string,
  fromChars: string,
  toChars: string,
  config: any,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'write', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.readFile(resolvedPath, 'utf-8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            const translationMap = new Map<string, string>();
            for (let i = 0; i < fromChars.length; i++) {
              translationMap.set(fromChars[i], toChars[i]);
            }
            let newData = '';
            for (const char of data) {
              newData += translationMap.get(char) || char;
            }
            fs.writeFile(resolvedPath, newData, 'utf-8', (err) => {
              if (err) {
                reject(err);
              } else {
                resolve(`Translated characters in ${filePath}`);
              }
            });
          }
        });
      })
      .catch(reject);
  });
}
