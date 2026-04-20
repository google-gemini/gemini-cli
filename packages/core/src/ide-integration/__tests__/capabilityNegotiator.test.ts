/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  negotiate,
  isCapabilityAvailable,
  isCapabilityNative,
  formatNegotiationSummary,
} from '../capabilityNegotiator.js';
import {
  IDECapability,
  type IDEAdapter,
  type IDEConnectionConfig,
} from '../types.js';

/**
 * Create a minimal mock adapter with the specified capabilities.
 */
function createMockAdapter(
  name: string,
  capabilities: IDECapability[],
): IDEAdapter {
  return {
    name,
    capabilities: new Set(capabilities),
    async connect(_config: IDEConnectionConfig): Promise<void> {},
    async disconnect(): Promise<void> {},
    isConnected: () => false,
    async openFile(): Promise<void> {},
    async goToLine(): Promise<void> {},
    async showDiff(): Promise<void> {},
    async applyEdit(): Promise<void> {},
    async getSelection() {
      return undefined;
    },
    async showNotification(): Promise<void> {},
  };
}

describe('capabilityNegotiator', () => {
  describe('negotiate', () => {
    it('should classify all capabilities for a fully-featured adapter', () => {
      const adapter = createMockAdapter('vscode', [
        IDECapability.OpenFile,
        IDECapability.GoToLine,
        IDECapability.ShowDiff,
        IDECapability.ApplyEdit,
        IDECapability.ShowDiagnostic,
        IDECapability.RunCommand,
        IDECapability.GetSelection,
        IDECapability.ShowNotification,
      ]);

      const result = negotiate(adapter);

      expect(result.supported.size).toBe(8);
      expect(result.fallback.size).toBe(0);
      expect(result.unsupported.size).toBe(0);
    });

    it('should classify missing capabilities with fallback as fallback', () => {
      // Adapter with only OpenFile and GoToLine
      const adapter = createMockAdapter('minimal', [
        IDECapability.OpenFile,
        IDECapability.GoToLine,
      ]);

      const result = negotiate(adapter);

      expect(result.supported).toContain(IDECapability.OpenFile);
      expect(result.supported).toContain(IDECapability.GoToLine);
      expect(result.supported.size).toBe(2);

      // ShowDiff, ShowNotification, and ShowDiagnostic have fallbacks
      expect(result.fallback).toContain(IDECapability.ShowDiff);
      expect(result.fallback).toContain(IDECapability.ShowNotification);
      expect(result.fallback).toContain(IDECapability.ShowDiagnostic);

      // ApplyEdit, RunCommand, GetSelection have no fallback
      expect(result.unsupported).toContain(IDECapability.ApplyEdit);
      expect(result.unsupported).toContain(IDECapability.RunCommand);
      expect(result.unsupported).toContain(IDECapability.GetSelection);
    });

    it('should handle an adapter with no capabilities', () => {
      const adapter = createMockAdapter('empty', []);

      const result = negotiate(adapter);

      expect(result.supported.size).toBe(0);
      // ShowDiff, ShowNotification, ShowDiagnostic go to fallback
      expect(result.fallback.size).toBe(3);
      // Remaining 5 are unsupported
      expect(result.unsupported.size).toBe(5);
    });

    it('should classify generic LSP adapter capabilities correctly', () => {
      const adapter = createMockAdapter('generic-lsp', [
        IDECapability.OpenFile,
        IDECapability.GoToLine,
        IDECapability.ShowDiagnostic,
      ]);

      const result = negotiate(adapter);

      expect(result.supported).toContain(IDECapability.OpenFile);
      expect(result.supported).toContain(IDECapability.GoToLine);
      expect(result.supported).toContain(IDECapability.ShowDiagnostic);
      expect(result.supported.size).toBe(3);

      // ShowDiff and ShowNotification still get fallback
      expect(result.fallback).toContain(IDECapability.ShowDiff);
      expect(result.fallback).toContain(IDECapability.ShowNotification);

      expect(result.unsupported).toContain(IDECapability.ApplyEdit);
      expect(result.unsupported).toContain(IDECapability.RunCommand);
      expect(result.unsupported).toContain(IDECapability.GetSelection);
    });
  });

  describe('isCapabilityAvailable', () => {
    it('should return true for supported capabilities', () => {
      const adapter = createMockAdapter('test', [IDECapability.OpenFile]);
      const result = negotiate(adapter);

      expect(isCapabilityAvailable(result, IDECapability.OpenFile)).toBe(true);
    });

    it('should return true for fallback capabilities', () => {
      const adapter = createMockAdapter('test', [IDECapability.OpenFile]);
      const result = negotiate(adapter);

      // ShowDiff has a fallback
      expect(isCapabilityAvailable(result, IDECapability.ShowDiff)).toBe(true);
    });

    it('should return false for unsupported capabilities', () => {
      const adapter = createMockAdapter('test', [IDECapability.OpenFile]);
      const result = negotiate(adapter);

      expect(isCapabilityAvailable(result, IDECapability.RunCommand)).toBe(
        false,
      );
    });
  });

  describe('isCapabilityNative', () => {
    it('should return true only for natively supported capabilities', () => {
      const adapter = createMockAdapter('test', [
        IDECapability.OpenFile,
        IDECapability.GoToLine,
      ]);
      const result = negotiate(adapter);

      expect(isCapabilityNative(result, IDECapability.OpenFile)).toBe(true);
      expect(isCapabilityNative(result, IDECapability.GoToLine)).toBe(true);
      // ShowDiff has fallback, not native
      expect(isCapabilityNative(result, IDECapability.ShowDiff)).toBe(false);
    });
  });

  describe('formatNegotiationSummary', () => {
    it('should produce a human-readable summary', () => {
      const adapter = createMockAdapter('test', [
        IDECapability.OpenFile,
        IDECapability.GoToLine,
      ]);
      const result = negotiate(adapter);
      const summary = formatNegotiationSummary(result);

      expect(summary).toContain('Supported:');
      expect(summary).toContain('openFile');
      expect(summary).toContain('goToLine');
      expect(summary).toContain('Fallback:');
      expect(summary).toContain('Unsupported:');
    });

    it('should omit sections with no entries', () => {
      const adapter = createMockAdapter('full', [
        IDECapability.OpenFile,
        IDECapability.GoToLine,
        IDECapability.ShowDiff,
        IDECapability.ApplyEdit,
        IDECapability.ShowDiagnostic,
        IDECapability.RunCommand,
        IDECapability.GetSelection,
        IDECapability.ShowNotification,
      ]);
      const result = negotiate(adapter);
      const summary = formatNegotiationSummary(result);

      expect(summary).toContain('Supported:');
      expect(summary).not.toContain('Fallback:');
      expect(summary).not.toContain('Unsupported:');
    });
  });
});
