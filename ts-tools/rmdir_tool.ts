
import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function rmdirDir(dirPath: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(dirPath, "write", config)
            .then(() => {
                const resolvedPath = path.resolve(dirPath);
                fs.rmdir(resolvedPath, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(`Removed directory ${dirPath}`);
                    }
                });
            })
            .catch(reject);
    });
}
