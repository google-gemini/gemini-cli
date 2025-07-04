

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function grepFiles(filePath: string, pattern: string, config: any, regex: boolean = false): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "read", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                fs.readFile(resolvedPath, 'utf-8', (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        const lines = data.split('\n');
                        const result: string[] = [];
                        const re = regex ? new RegExp(pattern) : null;
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            if (re) {
                                if (re.test(line)) {
                                    result.push(`${resolvedPath}:${i + 1}:${line}`);
                                }
                            } else {
                                if (line.includes(pattern)) {
                                    result.push(`${resolvedPath}:${i + 1}:${line}`);
                                }
                            }
                        }
                        resolve(result.length > 0 ? result.join('\n') : "No matches found");
                    }
                });
            })
            .catch(reject);
    });
}

