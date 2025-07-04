
import * as fs from 'fs';
import * as path from 'path';
import * as diff from 'diff';
import { checkFilePermission } from './check_file_permission';

export function patchFile(filePath: string, patchContent: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "write", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                fs.readFile(resolvedPath, 'utf-8', (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        const patched = diff.applyPatch(data, patchContent);
                        if (patched === false) {
                            reject(new Error("Failed to apply patch"));
                            return;
                        }
                        fs.writeFile(resolvedPath, patched, 'utf-8', (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(`Applied patch to ${filePath}`);
                            }
                        });
                    }
                });
            })
            .catch(reject);
    });
}
