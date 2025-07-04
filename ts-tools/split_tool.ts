import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function splitFile(
  filePath: string,
  linesPerFile: number,
  prefix: string,
  config: any,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'read', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.readFile(resolvedPath, 'utf-8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            const lines = data.split('\n');
            let fileCount = 0;
            for (let i = 0; i < lines.length; i += linesPerFile) {
              const outputPath = path.join(
                path.dirname(resolvedPath),
                `${prefix}${fileCount}.txt`,
              );
              const chunk = lines.slice(i, i + linesPerFile);
              fs.writeFile(outputPath, chunk.join('\n'), 'utf-8', (err) => {
                if (err) {
                  reject(err);
                }
              });
              fileCount++;
            }
            resolve(`Split ${filePath} into ${fileCount} files`);
          }
        });
      })
      .catch(reject);
  });
}
