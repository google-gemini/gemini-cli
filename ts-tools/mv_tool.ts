
import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function mvFile(srcPath: string, dstPath: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        Promise.all([
            checkFilePermission(srcPath, "write", config),
            checkFilePermission(dstPath, "write", config)
        ])
            .then(() => {
                const resolvedSrc = path.resolve(srcPath);
                const resolvedDst = path.resolve(dstPath);
                fs.rename(resolvedSrc, resolvedDst, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(`Moved ${srcPath} to ${dstPath}`);
                    }
                });
            })
            .catch(reject);
    });
}
