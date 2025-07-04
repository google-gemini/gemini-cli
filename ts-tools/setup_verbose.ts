
import * as winston from 'winston';
import * as fs from 'fs';
import { checkFilePermission } from './check_file_permission';

export function setupVerbose(config: any): winston.Logger {
    const level = config.verbose ? 'debug' : 'info';
    const logger = winston.createLogger({
        level: level,
        format: winston.format.json(),
        transports: [
            new winston.transports.Console({
                format: winston.format.simple(),
            }),
        ],
    });
    return logger;
}

export function readWithVerbose(filePath: string, config: any): Promise<string> {
    const logger = setupVerbose(config);
    logger.debug(`Checking permissions for ${filePath}`);
    return new Promise((resolve, reject) => {
        checkFilePermission(filePath, "read", config)
            .then(() => {
                logger.debug(`Reading file ${filePath}`);
                fs.readFile(filePath, 'utf-8', (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            })
            .catch(reject);
    });
}
