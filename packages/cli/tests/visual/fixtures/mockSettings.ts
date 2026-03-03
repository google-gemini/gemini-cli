import { SettingScope } from '../../config/settings.js';

export const mockSettings = {
  forScope: (scope: any) => ({
    settings: {
      'general.vimMode': false,
      'ui.theme': 'dark',
    }
  }),
  merged: {
    'general.vimMode': false,
    'ui.theme': 'dark',
  },
  workspace: { path: '/home/champbreed/project' }
};
