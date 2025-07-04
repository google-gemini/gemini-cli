
import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function catNumbered(filePath: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "read", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                fs.readFile(resolvedPath, 'utf-8', (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        const lines = data.split('\n');
                        const numberedLines = lines.map((line, i) => `${i + 1}: ${line}`);
                        resolve(numberedLines.join('\n'));
                    }
                });
            })
            .catch(reject);
    });
}

