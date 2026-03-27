/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import {
  UnifiedModeIndicator,
  getModeHeaderLabel,
} from './UnifiedModeIndicator.js';
import {
  MODE_HEADER_SHELL,
  MODE_HEADER_YOLO,
  MODE_HEADER_DEFAULT,
} from '../textConstants.js';
import { ApprovalMode } from '@google/gemini-cli-core';

describe('UnifiedModeIndicator', () => {
  describe('getModeHeaderLabel', () => {
    it('returns shell exit label when shell is active', () => {
      expect(getModeHeaderLabel(ApprovalMode.DEFAULT, true)).toBe(
        MODE_HEADER_SHELL,
      );
    });

    it('returns yolo toggle label when YOLO is active and shell is NOT active', () => {
      expect(getModeHeaderLabel(ApprovalMode.YOLO, false)).toBe(
        MODE_HEADER_YOLO,
      );
    });

    it('returns default mode label for other modes', () => {
      expect(getModeHeaderLabel(ApprovalMode.DEFAULT, false)).toBe(
        MODE_HEADER_DEFAULT,
      );
      expect(getModeHeaderLabel(ApprovalMode.PLAN, false)).toBe(
        MODE_HEADER_DEFAULT,
      );
      expect(getModeHeaderLabel(ApprovalMode.AUTO_EDIT, false)).toBe(
        MODE_HEADER_DEFAULT,
      );
    });
  });

  describe('Rendering', () => {
    it('renders shell mode with precedence over YOLO', async () => {
      const { lastFrame } = await renderWithProviders(
        <UnifiedModeIndicator
          approvalMode={ApprovalMode.YOLO}
          shellModeActive={true}
          renderMarkdown={true}
        />,
      );
      expect(lastFrame()).toContain('shell');
      expect(lastFrame()).not.toContain('YOLO');
    });

    it('renders YOLO mode with precedence over background mode', async () => {
      const { lastFrame } = await renderWithProviders(
        <UnifiedModeIndicator
          approvalMode={ApprovalMode.YOLO}
          shellModeActive={false}
          renderMarkdown={true}
        />,
      );
      expect(lastFrame()).toContain('YOLO');
      expect(lastFrame()).not.toContain('manual');
    });

    it('renders background mode (manual)', async () => {
      const { lastFrame } = await renderWithProviders(
        <UnifiedModeIndicator
          approvalMode={ApprovalMode.DEFAULT}
          shellModeActive={false}
          renderMarkdown={true}
        />,
      );
      expect(lastFrame()).toContain('manual');
    });

    it('renders background mode (plan)', async () => {
      const { lastFrame } = await renderWithProviders(
        <UnifiedModeIndicator
          approvalMode={ApprovalMode.PLAN}
          shellModeActive={false}
          renderMarkdown={true}
        />,
      );
      expect(lastFrame()).toContain('plan');
    });

    it('renders background mode (auto-accept)', async () => {
      const { lastFrame } = await renderWithProviders(
        <UnifiedModeIndicator
          approvalMode={ApprovalMode.AUTO_EDIT}
          shellModeActive={false}
          renderMarkdown={true}
        />,
      );
      expect(lastFrame()).toContain('auto-accept');
    });

    it('renders raw markdown modifier', async () => {
      const { lastFrame } = await renderWithProviders(
        <UnifiedModeIndicator
          approvalMode={ApprovalMode.DEFAULT}
          shellModeActive={false}
          renderMarkdown={false}
        />,
      );
      expect(lastFrame()).toContain('manual');
      expect(lastFrame()).toContain('·');
      expect(lastFrame()).toContain('raw');
    });
  });
});
