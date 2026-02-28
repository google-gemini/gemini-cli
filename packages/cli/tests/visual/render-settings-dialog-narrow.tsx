/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect } from 'react';
import { render } from 'ink';
import { SettingsDialog } from '../../src/ui/components/SettingsDialog.js';
import { mockSettings } from './fixtures/mockSettings.js';

const FixtureWrapper = () => {
  useEffect(() => {
    const timer = setTimeout(() => process.exit(0), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SettingsDialog
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settings={mockSettings as any}
      onSelect={() => {}}
    />
  );
};

render(<FixtureWrapper />);
