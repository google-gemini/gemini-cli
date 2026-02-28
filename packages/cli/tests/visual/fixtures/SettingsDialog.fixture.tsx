import React from 'react';
import { render } from 'ink';
import { SettingsDialog } from '../../../src/ui/components/SettingsDialog.js';
import { mockSettings } from './mockSettings.js';

const TestWrapper = () => {
  React.useEffect(() => {
    // 5 seconds to ensure the PTY captures the full layout
    const timer = setTimeout(() => {
      process.exit(0);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SettingsDialog 
      settings={mockSettings as any} 
      onSelect={() => {}} 
    />
  );
};

render(<TestWrapper />);
