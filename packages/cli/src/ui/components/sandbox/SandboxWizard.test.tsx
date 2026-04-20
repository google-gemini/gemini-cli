/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  ProjectType,
  SandboxMethod,
  WizardStep,
  PROJECT_TYPE_PRESETS,
} from './types.js';

describe('Sandbox Wizard Types', () => {
  describe('PROJECT_TYPE_PRESETS', () => {
    it('should have presets for all project types', () => {
      for (const projectType of Object.values(ProjectType)) {
        expect(PROJECT_TYPE_PRESETS[projectType]).toBeDefined();
      }
    });

    it('should have all permission fields in each preset', () => {
      const requiredFields = [
        'fileRead',
        'fileWrite',
        'shellCommands',
        'webSearch',
        'webFetch',
        'mcpServers',
      ];

      for (const preset of Object.values(PROJECT_TYPE_PRESETS)) {
        for (const field of requiredFields) {
          expect(preset).toHaveProperty(field);
        }
      }
    });

    it('should have valid decision values in all presets', () => {
      const validDecisions = ['allow', 'ask_user', 'deny'];

      for (const preset of Object.values(PROJECT_TYPE_PRESETS)) {
        for (const value of Object.values(preset)) {
          expect(validDecisions).toContain(value);
        }
      }
    });

    it('web app preset should allow file read and web access', () => {
      const webPreset = PROJECT_TYPE_PRESETS[ProjectType.WEB_APP];
      expect(webPreset.fileRead).toBe('allow');
      expect(webPreset.webSearch).toBe('allow');
      expect(webPreset.webFetch).toBe('allow');
    });

    it('CLI tool preset should deny web fetch and MCP', () => {
      const cliPreset = PROJECT_TYPE_PRESETS[ProjectType.CLI_TOOL];
      expect(cliPreset.webFetch).toBe('deny');
      expect(cliPreset.mcpServers).toBe('deny');
    });

    it('data science preset should be permissive', () => {
      const dsPreset = PROJECT_TYPE_PRESETS[ProjectType.DATA_SCIENCE];
      expect(dsPreset.fileRead).toBe('allow');
      expect(dsPreset.fileWrite).toBe('allow');
      expect(dsPreset.shellCommands).toBe('allow');
    });

    it('custom preset should default to ask_user for most tools', () => {
      const customPreset = PROJECT_TYPE_PRESETS[ProjectType.CUSTOM];
      expect(customPreset.fileWrite).toBe('ask_user');
      expect(customPreset.shellCommands).toBe('ask_user');
      expect(customPreset.mcpServers).toBe('ask_user');
    });
  });

  describe('WizardStep', () => {
    it('should have sequential step values', () => {
      expect(WizardStep.PROJECT_TYPE).toBe(1);
      expect(WizardStep.PERMISSIONS).toBe(2);
      expect(WizardStep.SANDBOX_METHOD).toBe(3);
      expect(WizardStep.REVIEW).toBe(4);
    });
  });

  describe('SandboxMethod', () => {
    it('should have expected method values', () => {
      expect(SandboxMethod.NONE).toBe('none');
      expect(SandboxMethod.DOCKER).toBe('docker');
      expect(SandboxMethod.SEATBELT).toBe('seatbelt');
      expect(SandboxMethod.GVISOR).toBe('gvisor');
    });
  });
});
