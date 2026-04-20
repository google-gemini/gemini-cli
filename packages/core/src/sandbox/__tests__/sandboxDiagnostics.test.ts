/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SandboxDiagnosticsCollector } from '../sandboxDiagnostics.js';
import { SandboxDriverType } from '../types.js';
import type { SandboxDiagnostic } from '../types.js';

describe('SandboxDiagnosticsCollector', () => {
  let collector: SandboxDiagnosticsCollector;

  beforeEach(() => {
    collector = new SandboxDiagnosticsCollector();
  });

  describe('addDiagnostics / getAll', () => {
    it('starts empty', () => {
      expect(collector.getAll()).toEqual([]);
    });

    it('adds diagnostics with correct metadata', () => {
      const diag: SandboxDiagnostic = {
        level: 'info',
        code: 'TEST_INFO',
        message: 'Test info message',
      };
      collector.addDiagnostics(SandboxDriverType.Docker, [diag]);

      const all = collector.getAll();
      expect(all.length).toBe(1);
      expect(all[0].driverType).toBe(SandboxDriverType.Docker);
      expect(all[0].diagnostic).toBe(diag);
      expect(all[0].timestamp).toBeTruthy();
    });

    it('adds multiple diagnostics at once', () => {
      const diags: SandboxDiagnostic[] = [
        { level: 'info', code: 'A', message: 'First' },
        { level: 'warning', code: 'B', message: 'Second' },
      ];
      collector.addDiagnostics(SandboxDriverType.Podman, diags);
      expect(collector.getAll().length).toBe(2);
    });

    it('accumulates diagnostics from different drivers', () => {
      collector.addDiagnostics(SandboxDriverType.Docker, [
        { level: 'info', code: 'D1', message: 'Docker ok' },
      ]);
      collector.addDiagnostics(SandboxDriverType.Seatbelt, [
        { level: 'error', code: 'S1', message: 'Seatbelt failed' },
      ]);
      expect(collector.getAll().length).toBe(2);
    });
  });

  describe('getByLevel', () => {
    beforeEach(() => {
      collector.addDiagnostics(SandboxDriverType.Docker, [
        { level: 'info', code: 'I1', message: 'Info' },
        { level: 'warning', code: 'W1', message: 'Warning' },
        { level: 'error', code: 'E1', message: 'Error' },
      ]);
    });

    it('filters by info level', () => {
      const infos = collector.getByLevel('info');
      expect(infos.length).toBe(1);
      expect(infos[0].diagnostic.code).toBe('I1');
    });

    it('filters by warning level', () => {
      const warnings = collector.getByLevel('warning');
      expect(warnings.length).toBe(1);
      expect(warnings[0].diagnostic.code).toBe('W1');
    });

    it('filters by error level', () => {
      const errors = collector.getByLevel('error');
      expect(errors.length).toBe(1);
      expect(errors[0].diagnostic.code).toBe('E1');
    });
  });

  describe('getByDriver', () => {
    beforeEach(() => {
      collector.addDiagnostics(SandboxDriverType.Docker, [
        { level: 'info', code: 'D1', message: 'Docker ok' },
      ]);
      collector.addDiagnostics(SandboxDriverType.Podman, [
        { level: 'info', code: 'P1', message: 'Podman ok' },
        { level: 'warning', code: 'P2', message: 'Podman warning' },
      ]);
    });

    it('returns only entries for the specified driver', () => {
      const dockerDiags = collector.getByDriver(SandboxDriverType.Docker);
      expect(dockerDiags.length).toBe(1);
      expect(dockerDiags[0].diagnostic.code).toBe('D1');
    });

    it('returns all entries for a driver with multiple diagnostics', () => {
      const podmanDiags = collector.getByDriver(SandboxDriverType.Podman);
      expect(podmanDiags.length).toBe(2);
    });

    it('returns empty for a driver with no diagnostics', () => {
      const seatbeltDiags = collector.getByDriver(SandboxDriverType.Seatbelt);
      expect(seatbeltDiags.length).toBe(0);
    });
  });

  describe('hasErrors / hasWarnings', () => {
    it('returns false when empty', () => {
      expect(collector.hasErrors()).toBe(false);
      expect(collector.hasWarnings()).toBe(false);
    });

    it('detects errors', () => {
      collector.addDiagnostics(SandboxDriverType.Docker, [
        { level: 'error', code: 'E', message: 'Error' },
      ]);
      expect(collector.hasErrors()).toBe(true);
      expect(collector.hasWarnings()).toBe(false);
    });

    it('detects warnings', () => {
      collector.addDiagnostics(SandboxDriverType.Docker, [
        { level: 'warning', code: 'W', message: 'Warning' },
      ]);
      expect(collector.hasErrors()).toBe(false);
      expect(collector.hasWarnings()).toBe(true);
    });

    it('detects both errors and warnings', () => {
      collector.addDiagnostics(SandboxDriverType.Docker, [
        { level: 'error', code: 'E', message: 'Error' },
        { level: 'warning', code: 'W', message: 'Warning' },
      ]);
      expect(collector.hasErrors()).toBe(true);
      expect(collector.hasWarnings()).toBe(true);
    });
  });

  describe('formatSummary', () => {
    it('returns a message for empty collector', () => {
      const summary = collector.formatSummary();
      expect(summary).toContain('No sandbox diagnostics recorded');
    });

    it('formats diagnostics with level prefix and code', () => {
      collector.addDiagnostics(SandboxDriverType.Docker, [
        { level: 'error', code: 'DOCKER_FAIL', message: 'Docker not found' },
      ]);
      const summary = collector.formatSummary();
      expect(summary).toContain('[ERROR]');
      expect(summary).toContain('DOCKER_FAIL');
      expect(summary).toContain('Docker not found');
    });

    it('includes suggestions when present', () => {
      collector.addDiagnostics(SandboxDriverType.Docker, [
        {
          level: 'error',
          code: 'DOCKER_FAIL',
          message: 'Docker not found',
          suggestion: 'Install Docker',
        },
      ]);
      const summary = collector.formatSummary();
      expect(summary).toContain('Install Docker');
      expect(summary).toContain('->');
    });
  });

  describe('clear', () => {
    it('removes all diagnostics', () => {
      collector.addDiagnostics(SandboxDriverType.Docker, [
        { level: 'info', code: 'I', message: 'Info' },
        { level: 'error', code: 'E', message: 'Error' },
      ]);
      expect(collector.getAll().length).toBe(2);

      collector.clear();
      expect(collector.getAll().length).toBe(0);
      expect(collector.hasErrors()).toBe(false);
    });
  });
});
