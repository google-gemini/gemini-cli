import { useEffect } from 'react';
import { render } from 'ink';
import { SettingsDialog } from '../../src/ui/components/SettingsDialog';
import { VimModeProvider } from '../../src/ui/contexts/VimModeContext';
import { KeypressProvider } from '../../src/ui/contexts/KeypressContext';
import { UIStateContext } from '../../src/ui/contexts/UIStateContext';

const mockData = {
  general: { vimMode: true, disableAutoUpdate: false },
  ui: { showMemoryUsage: true, theme: 'system' }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const robustMockSettings = {
  merged: mockData,
  forScope: (scope: string) => ({
    settings: mockData,
    originalSettings: mockData,
    path: `/${scope}/settings.json`
  }),
  user: { settings: mockData },
  system: { settings: mockData },
  workspace: { settings: mockData }
} as any;

const mockUIState = {
  searchBuffer: '',
  setSearchBuffer: () => {},
  isSearching: false,
  setIsSearching: () => {},
  activeTab: 'general',
  setActiveTab: () => {},
};

const FixtureWrapper = () => {
  useEffect(() => {
    const timer = setTimeout(() => process.exit(0), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <UIStateContext.Provider value={mockUIState as any}>
      <VimModeProvider settings={robustMockSettings}>
        <KeypressProvider kittyProtocolEnabled={false}>
          <SettingsDialog
            settings={robustMockSettings}
            onSelect={() => {}}
          />
        </KeypressProvider>
      </VimModeProvider>
    </UIStateContext.Provider>
  );
};

render(<FixtureWrapper />);
