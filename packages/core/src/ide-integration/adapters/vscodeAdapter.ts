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
 * VS Code IDE adapter.
 *
 * Communicates with the VS Code IDE companion extension via TCP or named pipe.
 * Supports the full set of IDE capabilities since VS Code's extension API
 * provides rich editor manipulation features.
 *
 * This adapter integrates with the existing gemini-cli vscode-ide-companion
 * extension by using the same protocol patterns (JSON-RPC over a length-prefixed
 * byte stream).
 */
export class VSCodeAdapter implements IDEAdapter {
  readonly name = 'vscode';

  readonly capabilities: ReadonlySet<IDECapability> = new Set([
    IDECapability.OpenFile,
    IDECapability.GoToLine,
    IDECapability.ShowDiff,
    IDECapability.ApplyEdit,
    IDECapability.ShowDiagnostic,
    IDECapability.RunCommand,
    IDECapability.GetSelection,
    IDECapability.ShowNotification,
  ]);

  private protocol: IDEProtocol | undefined;
  private socket: net.Socket | undefined;
  private connected = false;

  isConnected(): boolean {
    return this.connected;
  }

  async connect(config: IDEConnectionConfig): Promise<void> {
    if (this.connected) {
      return;
    }

    const socket = await this.createConnection(config);
    this.socket = socket;
    this.protocol = new IDEProtocol();
    this.protocol.setTransport(createSocketTransport(socket));

    socket.on('close', () => {
      this.connected = false;
    });

    socket.on('error', () => {
      this.connected = false;
    });

    // Perform a handshake to verify the connection is live
    try {
      await this.protocol.sendRequest('initialize', {
        clientName: 'gemini-cli',
        clientVersion: '1.0.0',
      });
      this.connected = true;
    } catch {
      socket.destroy();
      this.socket = undefined;
      this.protocol = undefined;
      throw new Error('VS Code handshake failed');
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
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
    await this.protocol!.sendRequest('editor/goToLine', { filePath, line });
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
    await this.protocol!.sendRequest('window/showNotification', {
      message,
      level,
    });
  }

  private ensureConnected(): void {
    if (!this.connected || !this.protocol) {
      throw new Error('VS Code adapter is not connected');
    }
  }

  private createConnection(config: IDEConnectionConfig): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      let socket: net.Socket;

      if (config.transport === 'named-pipe' && config.pipeName) {
        socket = net.createConnection(config.pipeName);
      } else if (
        (config.transport === 'tcp' || config.transport === 'websocket') &&
        config.port
      ) {
        socket = net.createConnection(config.port, config.host ?? '127.0.0.1');
      } else {
        return reject(
          new Error(
            `Unsupported transport "${config.transport}" for VS Code adapter`,
          ),
        );
      }

      socket.once('connect', () => resolve(socket));
      socket.once('error', (err) => reject(err));
    });
  }
}
