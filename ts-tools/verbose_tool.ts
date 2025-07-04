
import * as winston from 'winston';

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
