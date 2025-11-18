/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ExtensionUpdateState } from './extensions.js';

describe('ExtensionUpdateState', () => {
  describe('enum values', () => {
    it('should have CHECKING_FOR_UPDATES state', () => {
      expect(ExtensionUpdateState.CHECKING_FOR_UPDATES).toBe(
        'checking for updates',
      );
    });

    it('should have UPDATED_NEEDS_RESTART state', () => {
      expect(ExtensionUpdateState.UPDATED_NEEDS_RESTART).toBe(
        'updated, needs restart',
      );
    });

    it('should have UPDATING state', () => {
      expect(ExtensionUpdateState.UPDATING).toBe('updating');
    });

    it('should have UPDATE_AVAILABLE state', () => {
      expect(ExtensionUpdateState.UPDATE_AVAILABLE).toBe('update available');
    });

    it('should have UP_TO_DATE state', () => {
      expect(ExtensionUpdateState.UP_TO_DATE).toBe('up to date');
    });

    it('should have ERROR state', () => {
      expect(ExtensionUpdateState.ERROR).toBe('error');
    });

    it('should have NOT_UPDATABLE state', () => {
      expect(ExtensionUpdateState.NOT_UPDATABLE).toBe('not updatable');
    });

    it('should have UNKNOWN state', () => {
      expect(ExtensionUpdateState.UNKNOWN).toBe('unknown');
    });
  });

  describe('enum structure', () => {
    it('should have exactly 8 update states', () => {
      const stateKeys = Object.keys(ExtensionUpdateState);
      expect(stateKeys).toHaveLength(8);
    });

    it('should use lowercase for all values', () => {
      const stateValues = Object.values(ExtensionUpdateState);
      stateValues.forEach((value) => {
        expect(value).toBe(value.toLowerCase());
      });
    });

    it('should use UPPER_SNAKE_CASE for all keys', () => {
      const stateKeys = Object.keys(ExtensionUpdateState);
      stateKeys.forEach((key) => {
        expect(key).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
      });
    });
  });

  describe('state categories', () => {
    it('should have update-related states', () => {
      expect(ExtensionUpdateState.CHECKING_FOR_UPDATES).toContain('update');
      expect(ExtensionUpdateState.UPDATE_AVAILABLE).toContain('update');
      expect(ExtensionUpdateState.UPDATING).toContain('updat');
    });

    it('should have completion states', () => {
      expect(ExtensionUpdateState.UP_TO_DATE).toBeDefined();
      expect(ExtensionUpdateState.UPDATED_NEEDS_RESTART).toBeDefined();
    });

    it('should have error and edge case states', () => {
      expect(ExtensionUpdateState.ERROR).toBeDefined();
      expect(ExtensionUpdateState.UNKNOWN).toBeDefined();
      expect(ExtensionUpdateState.NOT_UPDATABLE).toBeDefined();
    });
  });

  describe('uniqueness', () => {
    it('should have unique values for all states', () => {
      const stateValues = Object.values(ExtensionUpdateState);
      const uniqueValues = new Set(stateValues);
      expect(uniqueValues.size).toBe(stateValues.length);
    });
  });

  describe('semantic meaning', () => {
    it('should differentiate between checking and updating', () => {
      expect(ExtensionUpdateState.CHECKING_FOR_UPDATES).not.toBe(
        ExtensionUpdateState.UPDATING,
      );
    });

    it('should differentiate between update available and up to date', () => {
      expect(ExtensionUpdateState.UPDATE_AVAILABLE).not.toBe(
        ExtensionUpdateState.UP_TO_DATE,
      );
    });

    it('should differentiate between error and unknown', () => {
      expect(ExtensionUpdateState.ERROR).not.toBe(ExtensionUpdateState.UNKNOWN);
    });
  });
});
