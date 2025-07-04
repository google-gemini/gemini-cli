
import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function touchFile(filePath: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "write", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                const time = new Date();
                fs.utimes(resolvedPath, time, time, (err) => {
                    if (err) {
                        fs.writeFile(resolvedPath, '', (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(`Touched ${filePath}`);
                            }
                        });
                    } else {
                        resolve(`Touched ${filePath}`);
                    }
                });
            })
            .catch(reject);
    });
}
