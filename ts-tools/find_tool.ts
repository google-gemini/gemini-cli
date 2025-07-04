

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';
import * as glob from 'glob';

export function findFiles(dirPath: string, pattern: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(dirPath, "read", config)
            .then(() => {
                const resolvedPath = path.resolve(dirPath);
                glob(`${resolvedPath}/**/${pattern}`, (err, files) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(files.join('\n'));
                    }
                });
            })
            .catch(reject);
    });
}

