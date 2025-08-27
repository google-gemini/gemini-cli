/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    // First, add a timestamp to the log info object
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS A', // Custom timestamp format
    }),
    // Here we define the custom output format
    winston.format.printf((info) => {
      const { level, timestamp, message, ...rest } = info;
      return (
        `[${level.toUpperCase()}] ${timestamp} -- ${message}` +
        `${Object.keys(rest).length > 0 ? `\n${JSON.stringify(rest, null, 2)}` : ''}`
      ); // Only print ...rest if present
    }),
  ),
  transports: [new winston.transports.Console()],
});

export { logger };
