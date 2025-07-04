

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function replaceNaturalLanguage(filePath: string, query: string, config: any): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "write", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                const editMap: { [key: string]: [string, string] } = {
                    "replace _init_exchange method": [
                        `def _init_exchange\\(self\\)(.*?)(?=\\n\\s*def|\\n\\s*class|$)`,
                        "def _init_exchange(self):\n    self.exchange = BybitV5Plugin(self.cfg)"
                    ]
                };
                const [oldPattern, newText] = editMap[query.toLowerCase()] || [query, query];
                fs.readFile(resolvedPath, 'utf-8', (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        const regex = new RegExp(oldPattern, 's');
                        if (!regex.test(data)) {
                            reject(new Error(`Pattern for '${query}' not found in ${filePath}`));
                        } else {
                            const newContent = data.replace(regex, newText);
                            fs.writeFile(resolvedPath, newContent, 'utf-8', (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(`Applied natural language replacement '${query}' in ${filePath}`);
                                }
                            });
                        }
                    }
                });
            })
            .catch(reject);
    });
}

