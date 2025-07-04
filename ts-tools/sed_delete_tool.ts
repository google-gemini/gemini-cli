

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function sedDelete(filePath: string, pattern: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "write", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                fs.readFile(resolvedPath, 'utf-8', (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        const lines = data.split('\n');
                        const regex = new RegExp(pattern);
                        const newLines = lines.filter(line => !regex.test(line));
                        fs.writeFile(resolvedPath, newLines.join('\n'), 'utf-8', (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(`Deleted matching lines in ${filePath}`);
                            }
                        });
                    }
                });
            })
            .catch(reject);
    });
}

