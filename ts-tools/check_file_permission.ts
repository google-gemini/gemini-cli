
import { minimatch } from 'minimatch';

export function checkFilePermission(filePath: string, operation: string, config: any): Promise<void> {
    return new Promise((resolve, reject) => {
        const rules = config.filePermissions || [];
        for (const rule of rules) {
            if (minimatch(filePath, rule.pattern)) {
                if (rule.operations.includes(operation)) {
                    if (rule.effect === "allow") {
                        resolve();
                        return;
                    }
                }
            }
        }
        reject(new Error(`Permission denied for ${operation} on ${filePath}`));
    });
}
