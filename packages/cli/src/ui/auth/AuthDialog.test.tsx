/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { AuthDialog } from './AuthDialog.js';
import { AuthType } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import { AuthState } from '../types.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { validateAuthMethodWithSettings } from './useAuth.js';
import { Text } from 'ink';

// Mocks
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    clearCachedCredentialFile: vi.fn(),
  };
});

vi.mock('./useAuth.js', () => ({
  validateAuthMethodWithSettings: vi.fn(),
}));

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../components/shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(({ items, initialIndex }) => (
    <>
      {items.map((item: { value: string; label: string }, index: number) => (
        <Text key={item.value}>
          {index === initialIndex ? '(selected)' : '(not selected)'}{' '}
          {item.label}
        </Text>
      ))}
    </>
  )),
}));

const mockedUseKeypress = useKeypress as Mock;
const mockedRadioButtonSelect = RadioButtonSelect as Mock;
const mockedValidateAuthMethod = validateAuthMethodWithSettings as Mock;

describe('AuthDialog', () => {
  let props: {
    settings: LoadedSettings;
    setAuthState: (state: AuthState) => void;
    authError: string | null;
    onAuthError: (error: string | null) => void;
    setAuthContext: (context: { requiresRestart?: boolean }) => void;
  };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_DEFAULT_AUTH_TYPE', undefined as unknown as string);
    vi.stubEnv('GEMINI_API_KEY', undefined as unknown as string);

    props = {
      settings: {
        merged: {
          security: {
            auth: {},
          },
        },
        setValue: vi.fn(),
      } as unknown as LoadedSettings,
      setAuthState: vi.fn(),
      authError: null,
      onAuthError: vi.fn(),
      setAuthContext: vi.fn(),
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('filters auth types when enforcedType is set', async () => {
    props.settings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
    const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
    const items = mockedRadioButtonSelect.mock.calls[0][0].items;
    expect(items).toHaveLength(1);
    expect(items[0].value).toBe(AuthType.USE_GEMINI);
    unmount();
  });

  it('sets initial index to 0 when enforcedType is set', async () => {
    props.settings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
    const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
    const { initialIndex } = mockedRadioButtonSelect.mock.calls[0][0];
    expect(initialIndex).toBe(0);
    unmount();
  });

  describe('Initial Auth Type Selection', () => {
    it.each([
      {
        setup: () => {
          props.settings.merged.security.auth.selectedType =
            AuthType.USE_GEMINI;
        },
        expected: AuthType.USE_GEMINI,
        desc: 'from settings',
      },
      {
        setup: () => {
          vi.stubEnv('GEMINI_DEFAULT_AUTH_TYPE', AuthType.USE_GEMINI);
        },
        expected: AuthType.USE_GEMINI,
        desc: 'from GEMINI_DEFAULT_AUTH_TYPE env var',
      },
      {
        setup: () => {
          vi.stubEnv('GEMINI_API_KEY', 'test-key');
        },
        expected: AuthType.USE_GEMINI,
        desc: 'from GEMINI_API_KEY env var',
      },
      {
        setup: () => {},
        expected: AuthType.USE_GEMINI,
        desc: 'defaults to Use Gemini API Key',
      },
    ])('selects initial auth type $desc', async ({ setup, expected }) => {
      setup();
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { items, initialIndex } = mockedRadioButtonSelect.mock.calls[0][0];
      expect(items[initialIndex].value).toBe(expected);
      unmount();
    });
  });

  describe('handleAuthSelect', () => {
    it('calls onAuthError if validation fails', async () => {
      mockedValidateAuthMethod.mockResolvedValue('Invalid method');
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(mockedValidateAuthMethod).toHaveBeenCalledWith(
        AuthType.USE_GEMINI,
        props.settings,
      );
      expect(props.onAuthError).toHaveBeenCalledWith('Invalid method');
      expect(props.settings.setValue).not.toHaveBeenCalled();
      unmount();
    });

    it('sets auth context with empty object for other auth types', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthContext).toHaveBeenCalledWith({});
      unmount();
    });

    it('always shows API key dialog even when env var is present', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      vi.stubEnv('GEMINI_API_KEY', 'test-key-from-env');
      // props.settings.merged.security.auth.selectedType is undefined here, simulating initial setup

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.AwaitingApiKeyInput,
      );
      unmount();
    });

    it('shows the OpenAI-compatible credential dialog when selected', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];

      await handleAuthSelect(AuthType.USE_OPENAI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.AwaitingOpenAIInput,
      );
      unmount();
    });

    it('always shows API key dialog even when env var is empty string', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      vi.stubEnv('GEMINI_API_KEY', ''); // Empty string
      // props.settings.merged.security.auth.selectedType is undefined here

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.AwaitingApiKeyInput,
      );
      unmount();
    });

    it('shows API key dialog on initial setup if no env var is present', async () => {
      mockedValidateAuthMethod.mockResolvedValue(null);
      // process.env['GEMINI_API_KEY'] is not set
      // props.settings.merged.security.auth.selectedType is undefined here, simulating initial setup

      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.AwaitingApiKeyInput,
      );
      unmount();
    });
  });

  it('displays authError when provided', async () => {
    props.authError = 'Something went wrong';
    const { lastFrame, unmount } = await renderWithProviders(
      <AuthDialog {...props} />,
    );
    expect(lastFrame()).toContain('Something went wrong');
    unmount();
  });

  describe('useKeypress', () => {
    it.each([
      {
        desc: 'does nothing on escape if authError is present',
        setup: () => {
          props.authError = 'Some error';
        },
        expectations: (p: typeof props) => {
          expect(p.onAuthError).not.toHaveBeenCalled();
          expect(p.setAuthState).not.toHaveBeenCalled();
        },
      },
      {
        desc: 'calls onAuthError on escape if no auth method is set',
        setup: () => {
          props.settings.merged.security.auth.selectedType = undefined;
        },
        expectations: (p: typeof props) => {
          expect(p.onAuthError).toHaveBeenCalledWith(
            'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
          );
        },
      },
      {
        desc: 'calls setAuthState(Unauthenticated) on escape if auth method is set',
        setup: () => {
          props.settings.merged.security.auth.selectedType =
            AuthType.USE_GEMINI;
        },
        expectations: (p: typeof props) => {
          expect(p.setAuthState).toHaveBeenCalledWith(
            AuthState.Unauthenticated,
          );
          expect(p.settings.setValue).not.toHaveBeenCalled();
        },
      },
    ])('$desc', async ({ setup, expectations }) => {
      setup();
      const { unmount } = await renderWithProviders(<AuthDialog {...props} />);
      const keypressHandler = mockedUseKeypress.mock.calls[0][0];
      keypressHandler({ name: 'escape' });
      expectations(props);
      unmount();
    });
  });

  describe('Snapshots', () => {
    it('renders correctly with default props', async () => {
      const { lastFrame, unmount } = await renderWithProviders(
        <AuthDialog {...props} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders correctly with auth error', async () => {
      props.authError = 'Something went wrong';
      const { lastFrame, unmount } = await renderWithProviders(
        <AuthDialog {...props} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders correctly with enforced auth type', async () => {
      props.settings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
      const { lastFrame, unmount } = await renderWithProviders(
        <AuthDialog {...props} />,
      );
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });
});
