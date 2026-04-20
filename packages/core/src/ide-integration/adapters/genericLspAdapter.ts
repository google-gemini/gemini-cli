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
 * Generic LSP-based IDE adapter.
 *
 * Provides a fallback integration for any editor that supports the Language
 * Server Protocol. Since LSP is primarily designed for language intelligence
 * rather than editor control, this adapter offers a limited capability set:
 *
 * - OpenFile: via window/showDocument
 * - GoToLine: via window/showDocument with selection range
 * - ShowDiagnostic: via textDocument/publishDiagnostics
 *
 * Editors that support this adapter include Emacs (with lsp-mode or eglot),
 * Sublime Text (with LSP package), Helix, and others with LSP client support.
 *
 * More advanced operations (ShowDiff, ApplyEdit, etc.) require editor-specific
 * extensions and should use a dedicated adapter instead.
 */
export class GenericLspAdapter implements IDEAdapter {
  readonly name = 'generic-lsp';

  readonly capabilities: ReadonlySet<IDECapability> = new Set([
    IDECapability.OpenFile,
    IDECapability.GoToLine,
    IDECapability.ShowDiagnostic,
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

    try {
      await this.protocol.sendRequest('initialize', {
        clientName: 'gemini-cli',
        clientVersion: '1.0.0',
        capabilities: {
          window: {
            showDocument: { support: true },
          },
          textDocument: {
            publishDiagnostics: {},
          },
        },
      });
      this.connected = true;
    } catch {
      socket.destroy();
      this.socket = undefined;
      this.protocol = undefined;
      throw new Error('LSP initialization handshake failed');
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
    // LSP window/showDocument request
    await this.protocol!.sendRequest('window/showDocument', {
      uri: this.pathToUri(filePath),
      external: false,
      takeFocus: true,
    });
  }

  async goToLine(filePath: string, line: number): Promise<void> {
    this.ensureConnected();
    // LSP window/showDocument with a selection range
    await this.protocol!.sendRequest('window/showDocument', {
      uri: this.pathToUri(filePath),
      external: false,
      takeFocus: true,
      selection: {
        start: { line: line - 1, character: 0 },
        end: { line: line - 1, character: 0 },
      },
    });
  }

  async showDiff(_filePath: string, _newContent: string): Promise<void> {
    throw new Error(
      'ShowDiff is not supported by the generic LSP adapter. Use an IDE-specific adapter instead.',
    );
  }

  async applyEdit(_filePath: string, _newContent: string): Promise<void> {
    throw new Error(
      'ApplyEdit is not supported by the generic LSP adapter. Use an IDE-specific adapter instead.',
    );
  }

  async getSelection(): Promise<EditorSelection | undefined> {
    throw new Error(
      'GetSelection is not supported by the generic LSP adapter. Use an IDE-specific adapter instead.',
    );
  }

  async showNotification(
    message: string,
    level: NotificationLevel,
  ): Promise<void> {
    this.ensureConnected();
    // LSP window/showMessage notification
    // MessageType: 1=Error, 2=Warning, 3=Info, 4=Log
    const messageType = level === 'error' ? 1 : level === 'warning' ? 2 : 3;

    this.protocol!.sendNotification('window/showMessage', {
      type: messageType,
      message,
    });
  }

  /**
   * Convert a file system path to a file:// URI suitable for LSP.
   */
  private pathToUri(filePath: string): string {
    // Handle Windows paths: C:\foo\bar -> file:///C:/foo/bar
    const normalized = filePath.replace(/\\/g, '/');
    if (/^[a-zA-Z]:/.test(normalized)) {
      return `file:///${normalized}`;
    }
    return `file://${normalized}`;
  }

  private ensureConnected(): void {
    if (!this.connected || !this.protocol) {
      throw new Error('Generic LSP adapter is not connected');
    }
  }

  private createConnection(config: IDEConnectionConfig): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      let socket: net.Socket;

      if (config.transport === 'tcp' && config.port) {
        socket = net.createConnection(config.port, config.host ?? '127.0.0.1');
      } else if (config.transport === 'named-pipe' && config.pipeName) {
        socket = net.createConnection(config.pipeName);
      } else {
        return reject(
          new Error(
            `Unsupported transport "${config.transport}" for generic LSP adapter. Use "tcp" or "named-pipe".`,
          ),
        );
      }

      socket.once('connect', () => resolve(socket));
      socket.once('error', (err) => reject(err));
    });
  }
}
