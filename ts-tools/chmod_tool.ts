
import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function chmodFile(filePath: string, mode: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "write", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                fs.chmod(resolvedPath, parseInt(mode, 8), (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(`Changed permissions of ${filePath} to ${mode}`);
                    }
                });
            })
            .catch(reject);
    });
}
