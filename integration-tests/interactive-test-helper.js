/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as pty from 'node-pty';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { env } from 'process';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class InteractiveTestRig {
  constructor() {
    this.bundlePath = join(__dirname, '..', 'bundle/gemini.js');
    this.process = null;
    this.outputBuffer = '';
    this.outputHandlers = [];
  }

  async spawn() {
    return new Promise((resolve, reject) => {
      // Use node-pty for proper terminal emulation
      this.process = pty.spawn('node', [this.bundlePath, '--yolo'], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: {
          ...process.env,
          FORCE_COLOR: '0', // Disable colors for easier parsing
          TERM: 'xterm-256color',
        }
      });

      this.process.onData((data) => {
        this.outputBuffer += data;
        
        // Debug output
        if (process.env.DEBUG_OUTPUT === 'true') {
          console.log('CLI output:', JSON.stringify(data));
        }
        
        // Check for any waiting output handlers
        this.outputHandlers = this.outputHandlers.filter(handler => {
          if (this.outputBuffer.includes(handler.pattern)) {
            handler.resolve(this.outputBuffer);
            return false;
          }
          return true;
        });
      });

      this.process.onExit((exitCode, signal) => {
        if (exitCode !== 0) {
          console.error(`CLI process exited with code ${exitCode}, signal ${signal}`);
        }
      });

      // Process spawned and listeners attached
      resolve();
    });
  }

  async pressKey(key) {
    if (!this.process) {
      throw new Error('Process not spawned');
    }
    
    // Send key to pty
    if (key === 'escape') {
      this.process.write('\x1b'); // ESC character
    } else {
      this.process.write(key);
    }
  }

  async clearInput() {
    // Send Ctrl+U to clear the input line
    this.process.write('\x15');
  }

  async waitForOutput(pattern, timeout = 5000) {
    if (this.outputBuffer.includes(pattern)) {
      return this.outputBuffer;
    }

    return new Promise((resolve, reject) => {
      let timeoutId;
      const wrappedResolve = (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      };
      const handler = { pattern, resolve: wrappedResolve };
      this.outputHandlers.push(handler);

      // Set timeout
      timeoutId = setTimeout(() => {
        const index = this.outputHandlers.indexOf(handler);
        if (index !== -1) {
          this.outputHandlers.splice(index, 1);
          reject(new Error(`Timeout waiting for output: "${pattern}"`));
        }
      }, timeout);
    });
  }

  async cleanup() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}