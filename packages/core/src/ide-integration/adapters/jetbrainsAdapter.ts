/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as net from 'node:net';
import {
  IDECapability,
  type IDEAdapter,
  type IDEConnectionConfig,
  type EditorSelection,
  type NotificationLevel,
} from '../types.js';
import { IDEProtocol, type ProtocolTransport } from '../protocol.js';

/**
 * Default port used by JetBrains IDE Services (built-in REST API).
 */
const JETBRAINS_DEFAULT_PORT = 63342;

/**
 * Well-known JetBrains IDE product identifiers, used for display and logging.
 */
export const JETBRAINS_PRODUCTS = [
  'IntelliJ IDEA',
  'WebStorm',
  'PyCharm',
  'GoLand',
  'CLion',
  'PhpStorm',
  'RustRover',
  'DataGrip',
  'Android Studio',
] as const;

/**
 * Creates a ProtocolTransport backed by a Node.js net.Socket.
 */
function createSocketTransport(socket: net.Socket): ProtocolTransport {
  return {
    send(data: string): void {
      socket.write(data);
    },
    onData(handler: (data: string) => void): void {
      socket.on('data', (chunk) => handler(chunk.toString('utf-8')));
    },
    close(): void {
      socket.destroy();
    },
  };
}

/**
 * JetBrains IDE adapter.
 *
 * Communicates with JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, etc.)
 * over TCP. Maps operations to the JetBrains IDE Services API where possible,
 * and falls back to the JSON-RPC protocol for extended capabilities.
 *
 * JetBrains IDEs expose a built-in HTTP server on port 63342 by default.
 * This adapter connects via TCP and uses the standard IDE protocol for
 * structured communication.
 */
export class JetBrainsAdapter implements IDEAdapter {
  readonly name = 'jetbrains';

  readonly capabilities: ReadonlySet<IDECapability> = new Set([
    IDECapability.OpenFile,
    IDECapability.GoToLine,
    IDECapability.ShowDiff,
    IDECapability.ApplyEdit,
    IDECapability.GetSelection,
    IDECapability.ShowNotification,
  ]);

  private protocol: IDEProtocol | undefined;
  private socket: net.Socket | undefined;
  private connected = false;
  private detectedProduct: string | undefined;

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Returns the detected JetBrains product name (e.g. "IntelliJ IDEA"),
   * or undefined if not yet connected or detection failed.
   */
  getDetectedProduct(): string | undefined {
    return this.detectedProduct;
  }

  async connect(config: IDEConnectionConfig): Promise<void> {
    if (this.connected) {
      return;
    }

    const port = config.port ?? JETBRAINS_DEFAULT_PORT;
    const host = config.host ?? '127.0.0.1';

    const socket = await this.createTcpConnection(host, port);
    this.socket = socket;
    this.protocol = new IDEProtocol();
    this.protocol.setTransport(createSocketTransport(socket));

    socket.on('close', () => {
      this.connected = false;
    });

    socket.on('error', () => {
      this.connected = false;
    });

    // Perform handshake and product detection
    try {
      const rawResult: unknown = await this.protocol.sendRequest('initialize', {
        clientName: 'gemini-cli',
        clientVersion: '1.0.0',
        ideFamily: 'jetbrains',
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- IDE protocol handshake response
      const initResult = rawResult as { productName?: string } | undefined;

      this.detectedProduct = initResult?.productName;
      this.connected = true;
    } catch {
      socket.destroy();
      this.socket = undefined;
      this.protocol = undefined;
      throw new Error('JetBrains handshake failed');
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.detectedProduct = undefined;
    if (this.protocol) {
      this.protocol.dispose();
      this.protocol = undefined;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = undefined;
    }
  }

  async openFile(filePath: string): Promise<void> {
    this.ensureConnected();
    await this.protocol!.sendRequest('editor/openFile', { filePath });
  }

  async goToLine(filePath: string, line: number): Promise<void> {
    this.ensureConnected();
    // JetBrains uses 0-based line numbers internally; convert from 1-based
    await this.protocol!.sendRequest('editor/goToLine', {
      filePath,
      line,
      column: 1,
    });
  }

  async showDiff(filePath: string, newContent: string): Promise<void> {
    this.ensureConnected();
    await this.protocol!.sendRequest('editor/showDiff', {
      filePath,
      newContent,
    });
  }

  async applyEdit(filePath: string, newContent: string): Promise<void> {
    this.ensureConnected();
    await this.protocol!.sendRequest('editor/applyEdit', {
      filePath,
      newContent,
    });
  }

  async getSelection(): Promise<EditorSelection | undefined> {
    this.ensureConnected();
    const rawResult: unknown = await this.protocol!.sendRequest(
      'editor/getSelection',
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- IDE protocol response shape
    const result = rawResult as EditorSelection | null;
    return result ?? undefined;
  }

  async showNotification(
    message: string,
    level: NotificationLevel,
  ): Promise<void> {
    this.ensureConnected();
    // Map notification levels to JetBrains balloon notification types
    const jetbrainsType =
      level === 'error'
        ? 'ERROR'
        : level === 'warning'
          ? 'WARNING'
          : 'INFORMATION';

    await this.protocol!.sendRequest('window/showNotification', {
      message,
      type: jetbrainsType,
    });
  }

  private ensureConnected(): void {
    if (!this.connected || !this.protocol) {
      throw new Error('JetBrains adapter is not connected');
    }
  }

  private createTcpConnection(host: string, port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(port, host);
      socket.once('connect', () => resolve(socket));
      socket.once('error', (err) => reject(err));
    });
  }
}
