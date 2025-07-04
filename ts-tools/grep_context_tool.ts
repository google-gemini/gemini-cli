

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function grepContext(filePath: string, pattern: string, contextLines: number, config: any): Promise<string> {
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
                        const regex = new RegExp(pattern);
                        for (let i = 0; i < lines.length; i++) {
                            if (regex.test(lines[i])) {
                                const start = Math.max(0, i - contextLines);
                                const end = Math.min(lines.length, i + contextLines + 1);
                                for (let j = start; j < end; j++) {
                                    result.push(`${resolvedPath}:${j + 1}:${lines[j]}`);
                                }
                            }
                        }
                        resolve(result.join('\n'));
                    }
                });
            })
            .catch(reject);
    });
}

