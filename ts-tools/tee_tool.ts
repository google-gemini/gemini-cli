
import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function teeFile(filePath: string, content: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "write", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                fs.writeFile(resolvedPath, content, 'utf-8', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(content);
                    }
                });
            })
            .catch(reject);
    });
}
