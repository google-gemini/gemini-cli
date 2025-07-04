
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { checkFilePermission } from './check_file_permission';

export function watchFile(filePath: string, command: string, interval: number, config: any): void {
    checkFilePermission(filePath, "read", config)
        .then(() => {
            const resolvedPath = path.resolve(filePath);
            let lastMtime = fs.statSync(resolvedPath).mtime;

            setInterval(() => {
                const mtime = fs.statSync(resolvedPath).mtime;
                if (mtime.getTime() !== lastMtime.getTime()) {
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`exec error: ${error}`);
                            return;
                        }
                        console.log(`stdout: ${stdout}`);
                        console.error(`stderr: ${stderr}`);
                    });
                    lastMtime = mtime;
                }
            }, interval);
        })
        .catch(console.error);
}
