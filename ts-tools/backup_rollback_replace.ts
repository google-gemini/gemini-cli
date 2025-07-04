import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function replaceWithBackup(
  filePath: string,
  oldPattern: string,
  newText: string,
  config: any,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'write', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        const backupPath = resolvedPath + '.bak';
        fs.copyFile(resolvedPath, backupPath, (err) => {
          if (err) {
            reject(err);
          } else {
            fs.readFile(resolvedPath, 'utf-8', (err, data) => {
              if (err) {
                reject(err);
              } else {
                const regex = new RegExp(oldPattern, 's');
                if (!regex.test(data)) {
                  reject(
                    new Error(
                      `Pattern '${oldPattern}' not found in ${filePath}`,
                    ),
                  );
                } else {
                  const newContent = data.replace(regex, newText);
                  fs.writeFile(resolvedPath, newContent, 'utf-8', (err) => {
                    if (err) {
                      fs.copyFile(backupPath, resolvedPath, () => reject(err));
                    } else {
                      resolve(
                        `Replaced pattern in ${filePath}, backup at ${backupPath}`,
                      );
                    }
                  });
                }
              }
            });
          }
        });
      })
      .catch(reject);
  });
}

export function replaceRollback(
  filePath: string,
  config: any,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'write', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        const backupPath = resolvedPath + '.bak';
        fs.access(backupPath, fs.constants.F_OK, (err) => {
          if (err) {
            reject(new Error(`No backup found for ${filePath}`));
          } else {
            fs.copyFile(backupPath, resolvedPath, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve(`Restored ${filePath} from backup`);
              }
            });
          }
        });
      })
      .catch(reject);
  });
}
