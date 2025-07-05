
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// A simple console logger that can be expanded later.
// For now, it just wraps the console methods.

export class ConsoleLogger {
    info(...args: any[]) {
        console.log(...args);
    }

    debug(...args: any[]) {
        console.debug(...args);
    }

    warn(...args: any[]) {
        console.warn(...args);
    }

    error(...args: any[]) {
        console.error(...args);
    }

    clear() {
        console.clear();
    }
}

// Export a singleton instance.
export const logger = new ConsoleLogger();
