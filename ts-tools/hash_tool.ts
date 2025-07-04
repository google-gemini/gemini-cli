
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { checkFilePermission } from './check_file_permission';

export function hashFile(filePath: string, config: any, algorithm: string = "sha256"): Promise<string> {
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "read", config)
            .then(() => {
                const resolvedPath = path.resolve(filePath);
                const hash = crypto.createHash(algorithm);
                const stream = fs.createReadStream(resolvedPath);
                stream.on('data', (data) => {
                    hash.update(data);
                });
                stream.on('end', () => {
                    resolve(hash.digest('hex'));
                });
                stream.on('error', (err) => {
                    reject(err);
                });
            })
            .catch(reject);
    });
}
