

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function sedAppend(filePath: string, pattern: string, content: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "write", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                fs.readFile(resolvedPath, 'utf-8', (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        const lines = data.split('\n');
                        const newLines: string[] = [];
                        const regex = new RegExp(pattern);
                        for (const line of lines) {
                            newLines.push(line);
                            if (regex.test(line)) {
                                newLines.push(content);
                            } 
                        }
                        fs.writeFile(resolvedPath, newLines.join('\n'), 'utf-8', (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(`Appended after pattern in ${filePath}`);
                            }
                        });
                    }
                });
            })
            .catch(reject);
    });
}

