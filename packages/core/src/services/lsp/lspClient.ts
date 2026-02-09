/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, ChildProcess } from "node:child_process";
import { debugLogger } from "../../utils/debugLogger.js";

export interface LspResponse {
  jsonrpc: "2.0";
  id?: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  method?: string;
  params?: any;
}

/**
 * A generic client for communicating with Language Servers via JSON-RPC over stdio.
 */
export class LspClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private responseHandlers = new Map<number | string, (response: LspResponse) => void>();
  private buffer = "";

  constructor(
    private readonly executable: string,
    private readonly args: string[],
    private readonly rootUri: string
  ) {}

  /**
   * Starts the language server process and sends the initialize request.
   */
  async start(): Promise<void> {
    debugLogger.log(`[LSP] Starting ${this.executable} ${this.args.join(" ")}`);
    
    this.process = spawn(this.executable, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      shell: process.platform === "win32"
    });

    this.process.stdout?.on("data", (data) => this.handleData(data));
    this.process.stderr?.on("data", (data) => {
      debugLogger.log(`[LSP Error] ${data.toString()}`);
    });

    this.process.on("exit", (code) => {
      debugLogger.log(`[LSP] Process exited with code ${code}`);
      this.process = null;
    });

    this.process.on("error", (err) => {
      debugLogger.error(`[LSP] Process error:`, err);
    });

    // Initialize the LSP
    await this.request("initialize", {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          definition: { dynamicRegistration: true },
          references: { dynamicRegistration: true },
          hover: { dynamicRegistration: true },
          publishDiagnostics: { relatedInformation: true }
        },
        workspace: {
          workspaceFolders: true,
          didChangeConfiguration: { dynamicRegistration: true }
        }
      }
    });

    await this.notification("initialized", {});
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString("utf8");
    while (true) {
      const contentLengthMatch = this.buffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!contentLengthMatch) break;

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const headerLength = contentLengthMatch[0].length;
      const totalLength = headerLength + contentLength;

      if (this.buffer.length < totalLength) break;

      const jsonStr = this.buffer.substring(headerLength, totalLength);
      this.buffer = this.buffer.substring(totalLength);

      try {
        const response: LspResponse = JSON.parse(jsonStr);
        if (response.id !== undefined && this.responseHandlers.has(response.id)) {
          this.responseHandlers.get(response.id)!(response);
          this.responseHandlers.delete(response.id);
        } else if (response.method) {
          // Handle notifications or requests from server (e.g. diagnostics)
          if (response.method === "textDocument/publishDiagnostics") {
             // Handle diagnostics if needed
          }
        }
      } catch (e) {
        debugLogger.error("[LSP] Failed to parse JSON-RPC message", e);
      }
    }
  }

  /**
   * Sends a request to the language server and returns the result.
   */
  async request(method: string, params: any): Promise<any> {
    const id = this.requestId++;
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    const json = JSON.stringify(message);
    const payload = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;

    return new Promise((resolve, reject) => {
      this.responseHandlers.set(id, (response) => {
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response.result);
        }
      });

      if (!this.process?.stdin?.writable) {
        reject(new Error("LSP process stdin is not writable"));
        return;
      }

      this.process.stdin.write(payload);
    });
  }

  /**
   * Sends a notification to the language server.
   */
  async notification(method: string, params: any): Promise<void> {
    const message = {
      jsonrpc: "2.0",
      method,
      params
    };

    const json = JSON.stringify(message);
    const payload = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;

    if (!this.process?.stdin?.writable) {
      throw new Error("LSP process stdin is not writable");
    }

    this.process.stdin.write(payload);
  }

  /**
   * Stops the language server process.
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
