
import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function backupFile(filePath: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "read", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                const backupPath = resolvedPath + ".bak";
                fs.copyFile(resolvedPath, backupPath, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(`Created backup at ${backupPath}`);
                    }
                });
            })
            .catch(reject);
    });
}
