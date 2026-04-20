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
 * Neovim IDE adapter.
 *
 * Communicates with Neovim via a socket connection (Unix domain socket or
 * named pipe on Windows). Neovim exposes a msgpack-rpc protocol on its
 * listen address; this adapter wraps that connection with the standard
 * IDE protocol layer.
 *
 * The adapter maps IDE operations to Neovim API calls:
 * - openFile  -> nvim_command('edit <path>')
 * - goToLine  -> nvim_command('edit +<line> <path>')
 * - showDiff  -> nvim_command('diffsplit')
 * - applyEdit -> nvim_buf_set_lines
 * - getSelection -> nvim_buf_get_mark + nvim_buf_get_lines
 * - showNotification -> nvim_echo / nvim_notify
 *
 * Neovim does not natively support ShowDiagnostic or RunCommand through
 * external RPC in the same way as VS Code, so those capabilities are
 * not advertised.
 */
export class NeovimAdapter implements IDEAdapter {
  readonly name = 'neovim';

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

    // Verify that Neovim is responsive
    try {
      await this.protocol.sendRequest('initialize', {
        clientName: 'gemini-cli',
        clientVersion: '1.0.0',
        ideFamily: 'neovim',
      });
      this.connected = true;
    } catch {
      socket.destroy();
      this.socket = undefined;
      this.protocol = undefined;
      throw new Error('Neovim connection handshake failed');
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
    await this.protocol!.sendRequest('nvim/command', {
      command: `edit ${this.escapeNeovimArg(filePath)}`,
    });
  }

  async goToLine(filePath: string, line: number): Promise<void> {
    this.ensureConnected();
    await this.protocol!.sendRequest('nvim/command', {
      command: `edit +${line} ${this.escapeNeovimArg(filePath)}`,
    });
  }

  async showDiff(filePath: string, newContent: string): Promise<void> {
    this.ensureConnected();
    await this.protocol!.sendRequest('nvim/showDiff', {
      filePath,
      newContent,
    });
  }

  async applyEdit(filePath: string, newContent: string): Promise<void> {
    this.ensureConnected();
    const lines = newContent.split('\n');
    await this.protocol!.sendRequest('nvim/bufSetLines', {
      filePath,
      lines,
    });
  }

  async getSelection(): Promise<EditorSelection | undefined> {
    this.ensureConnected();
    const rawResult: unknown =
      await this.protocol!.sendRequest('nvim/getSelection');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- IDE protocol response shape
    const result = rawResult as EditorSelection | null;
    return result ?? undefined;
  }

  async showNotification(
    message: string,
    level: NotificationLevel,
  ): Promise<void> {
    this.ensureConnected();
    // Map notification levels to Neovim log levels
    // See :help vim.log.levels
    const nvimLogLevel = level === 'error' ? 4 : level === 'warning' ? 3 : 2;

    await this.protocol!.sendRequest('nvim/notify', {
      message,
      logLevel: nvimLogLevel,
    });
  }

  /**
   * Escape a file path for use in a Neovim command.
   * Backslashes and spaces need special treatment.
   */
  private escapeNeovimArg(arg: string): string {
    return arg.replace(/\\/g, '\\\\').replace(/ /g, '\\ ');
  }

  private ensureConnected(): void {
    if (!this.connected || !this.protocol) {
      throw new Error('Neovim adapter is not connected');
    }
  }

  private createConnection(config: IDEConnectionConfig): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      let socket: net.Socket;

      if (config.transport === 'named-pipe' && config.pipeName) {
        socket = net.createConnection(config.pipeName);
      } else if (config.transport === 'tcp' && config.port) {
        socket = net.createConnection(config.port, config.host ?? '127.0.0.1');
      } else {
        // Try the NVIM_LISTEN_ADDRESS / NVIM environment variable as fallback
        const nvimSocket =
          process.env['NVIM_LISTEN_ADDRESS'] ?? process.env['NVIM'];
        if (nvimSocket) {
          socket = net.createConnection(nvimSocket);
        } else {
          return reject(
            new Error(
              'No Neovim socket address found. Set NVIM_LISTEN_ADDRESS or provide a named-pipe/tcp config.',
            ),
          );
        }
      }

      socket.once('connect', () => resolve(socket));
      socket.once('error', (err) => reject(err));
    });
  }
}
