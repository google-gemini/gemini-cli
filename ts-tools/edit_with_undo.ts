import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function editWithUndo(
  filePath: string,
  editFunc: (filePath: string, config: any, ...args: any[]) => Promise<string>,
  config: any,
  ...args: any[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'write', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        const undoPath = resolvedPath + '.undo';
        fs.copyFile(resolvedPath, undoPath, (err) => {
          if (err) {
            reject(err);
          } else {
            editFunc(filePath, config, ...args)
              .then(() => {
                resolve(
                  `Edit applied to ${filePath}, undo available at ${undoPath}`,
                );
              })
              .catch(reject);
          }
        });
      })
      .catch(reject);
  });
}

export function undoEdit(filePath: string, config: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const resolvedPath = path.resolve(filePath);
    const undoPath = resolvedPath + '.undo';
    fs.access(undoPath, fs.constants.F_OK, (err) => {
      if (err) {
        resolve('No undo available');
      } else {
        fs.rename(undoPath, resolvedPath, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(`Restored ${filePath} from undo`);
          }
        });
      }
    });
  });
}
