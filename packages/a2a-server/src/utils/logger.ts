/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import winston from 'winston';

import { redactRecord } from './redaction.js';

/**
 * `LOG_LEVEL` is allow-listed into `process.env` during server startup
 * (`http/app.ts`), so an operator who sets it means it. An unknown value
 * falls back to `info` rather than failing the process at boot.
 */
const resolveLevel = (): string => {
  const requested = process.env['LOG_LEVEL']?.trim().toLowerCase();
  return requested && requested in winston.config.npm.levels
    ? requested
    : 'info';
};

/**
 * Redacts the metadata of every log call, so a request body or a user
 * message that carries a credential does not reach stdout with it. Applied
 * as a format rather than at each call site, which is what keeps a log
 * added later from re-opening the hole.
 */
const redactMetadata = winston.format((info) => {
  const { level, timestamp, message, ...rest } = info;
  return { level, timestamp, message, ...redactRecord(rest) };
});

const logger = winston.createLogger({
  level: resolveLevel(),
  format: winston.format.combine(
    redactMetadata(),
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
