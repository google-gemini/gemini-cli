/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { GeminiCLIExtension } from '../config/config.js';

export interface ExtensionLoader {
  getExtensions(): GeminiCLIExtension[];

  extensionEvents(): EventEmitter<ExtensionEvents>;
}

export interface ExtensionEvents {
  extensionEnabled: ExtensionEnableEvent[];
  extensionDisabled: ExtensionDisableEvent[];
  extensionLoaded: ExtensionLoadEvent[];
  extensionUnloaded: ExtensionUnloadEvent[];
  extensionInstalled: ExtensionInstallEvent[];
  extensionUninstalled: ExtensionUninstallEvent[];
  extensionUpdated: ExtensionUpdateEvent[];
}

interface BaseExtensionEvent {
  extension: GeminiCLIExtension;
}
export type ExtensionDisableEvent = BaseExtensionEvent;
export type ExtensionEnableEvent = BaseExtensionEvent;
export type ExtensionInstallEvent = BaseExtensionEvent;
export type ExtensionLoadEvent = BaseExtensionEvent;
export type ExtensionUnloadEvent = BaseExtensionEvent;
export type ExtensionUninstallEvent = BaseExtensionEvent;
export type ExtensionUpdateEvent = BaseExtensionEvent;

export class SimpleExtensionLoader implements ExtensionLoader {
  private _eventEmitter = new EventEmitter<ExtensionEvents>();
  constructor(private readonly extensions: GeminiCLIExtension[]) {}

  extensionEvents(): EventEmitter<ExtensionEvents> {
    return this._eventEmitter;
  }

  getExtensions(): GeminiCLIExtension[] {
    return this.extensions;
  }
}
