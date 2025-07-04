
import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function sedReplace(filePath: string, oldPattern: string, newText: string, config: any, regex: boolean = false): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "write", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                fs.readFile(resolvedPath, 'utf-8', (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        let newContent: string;
                        if (regex) {
                            newContent = data.replace(new RegExp(oldPattern, 'g'), newText);
                        } else {
                            newContent = data.replace(oldPattern, newText);
                        }
                        fs.writeFile(resolvedPath, newContent, 'utf-8', (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(`Replaced text in ${filePath}`);
                            }
                        });
                    }
                });
            })
            .catch(reject);
    });
}
