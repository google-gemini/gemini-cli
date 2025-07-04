
import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function undoEdit(filePath: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "write", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                const undoPath = resolvedPath + ".undo";

                fs.access(undoPath, fs.constants.F_OK, (err) => {
                    if (err) {
                        reject(new Error(`No undo available for ${filePath}`));
                    } else {
                        fs.rename(undoPath, resolvedPath, (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(`Restored ${filePath} from undo`);
                            }
                        });
                    }
                });
            })
            .catch(reject);
    });
}
