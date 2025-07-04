

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function uniqFile(filePath: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "write", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                fs.readFile(resolvedPath, 'utf-8', (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        const lines = data.split('\n');
                        const uniqueLines = Array.from(new Set(lines));
                        fs.writeFile(resolvedPath, uniqueLines.join('\n'), 'utf-8', (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(`Removed duplicates from ${filePath}`);
                            }
                        });
                    }
                });
            })
            .catch(reject);
    });
}

