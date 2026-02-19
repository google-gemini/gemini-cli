/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
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
import { AuthType, type Config, debugLogger } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import { AuthState } from '../types.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { validateAuthMethodWithSettings } from './useAuth.js';
import { runExitCleanup } from '../../utils/cleanup.js';
import { Text } from 'ink';
import { RELAUNCH_EXIT_CODE } from '../../utils/processUtils.js';

// Mocks
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    clearCachedCredentialFile: vi.fn(),
  };
});

vi.mock('../../utils/cleanup.js', () => ({
  runExitCleanup: vi.fn(),
}));

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
const mockedRunExitCleanup = runExitCleanup as Mock;

describe('AuthDialog', () => {
  let props: {
    config: Config;
    settings: LoadedSettings;
    setAuthState: (state: AuthState) => void;
    authError: string | null;
    onAuthError: (error: string | null) => void;
    setAuthContext: (context: { requiresRestart?: boolean }) => void;
  };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('CLOUD_SHELL', undefined as unknown as string);
    vi.stubEnv('GEMINI_CLI_USE_COMPUTE_ADC', undefined as unknown as string);
    vi.stubEnv('GEMINI_DEFAULT_AUTH_TYPE', undefined as unknown as string);
    vi.stubEnv('GEMINI_API_KEY', undefined as unknown as string);

    props = {
      config: {
        isBrowserLaunchSuppressed: vi.fn().mockReturnValue(false),
      } as unknown as Config,
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

  describe('Environment Variable Effects on Auth Options', () => {
    const cloudShellLabel = 'Use Cloud Shell user credentials';
    const metadataServerLabel =
      'Use metadata server application default credentials';
    const computeAdcItem = (label: string) => ({
      label,
      value: AuthType.COMPUTE_ADC,
      key: AuthType.COMPUTE_ADC,
    });

    it.each([
      {
        env: { CLOUD_SHELL: 'true' },
        shouldContain: [computeAdcItem(cloudShellLabel)],
        shouldNotContain: [computeAdcItem(metadataServerLabel)],
        desc: 'in Cloud Shell',
      },
      {
        env: { GEMINI_CLI_USE_COMPUTE_ADC: 'true' },
        shouldContain: [computeAdcItem(metadataServerLabel)],
        shouldNotContain: [computeAdcItem(cloudShellLabel)],
        desc: 'with GEMINI_CLI_USE_COMPUTE_ADC',
      },
      {
        env: {},
        shouldContain: [],
        shouldNotContain: [
          computeAdcItem(cloudShellLabel),
          computeAdcItem(metadataServerLabel),
        ],
        desc: 'by default',
      },
    ])(
      'correctly shows/hides COMPUTE_ADC options $desc',
      async ({ env, shouldContain, shouldNotContain }) => {
        for (const [key, value] of Object.entries(env)) {
          vi.stubEnv(key, value as string);
        }
        const { waitUntilReady, unmount } = renderWithProviders(
          <AuthDialog {...props} />,
        );
        await waitUntilReady();
        const items = mockedRadioButtonSelect.mock.calls[0][0].items;
        for (const item of shouldContain) {
          expect(items).toContainEqual(item);
        }
        for (const item of shouldNotContain) {
          expect(items).not.toContainEqual(item);
        }
        unmount();
      },
    );
  });

  it('filters auth types when enforcedType is set', async () => {
    props.settings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
    const { waitUntilReady, unmount } = renderWithProviders(
      <AuthDialog {...props} />,
    );
    await waitUntilReady();
    const items = mockedRadioButtonSelect.mock.calls[0][0].items;
    expect(items).toHaveLength(1);
    expect(items[0].value).toBe(AuthType.USE_GEMINI);
    unmount();
  });

  it('sets initial index to 0 when enforcedType is set', async () => {
    props.settings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
    const { waitUntilReady, unmount } = renderWithProviders(
      <AuthDialog {...props} />,
    );
    await waitUntilReady();
    const { initialIndex } = mockedRadioButtonSelect.mock.calls[0][0];
    expect(initialIndex).toBe(0);
    unmount();
  });

  describe('Initial Auth Type Selection', () => {
    it.each([
      {
        setup: () => {
          props.settings.merged.security.auth.selectedType =
            AuthType.USE_VERTEX_AI;
        },
        expected: AuthType.USE_VERTEX_AI,
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
        expected: AuthType.LOGIN_WITH_GOOGLE,
        desc: 'defaults to Login with Google',
      },
    ])('selects initial auth type $desc', async ({ setup, expected }) => {
      setup();
      const { waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      const { items, initialIndex } = mockedRadioButtonSelect.mock.calls[0][0];
      expect(items[initialIndex].value).toBe(expected);
      unmount();
    });
  });

  describe('handleAuthSelect', () => {
    it('calls onAuthError if validation fails', async () => {
      mockedValidateAuthMethod.mockReturnValue('Invalid method');
      const { waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      handleAuthSelect(AuthType.USE_GEMINI);

      expect(mockedValidateAuthMethod).toHaveBeenCalledWith(
        AuthType.USE_GEMINI,
        props.settings,
      );
      expect(props.onAuthError).toHaveBeenCalledWith('Invalid method');
      expect(props.settings.setValue).not.toHaveBeenCalled();
      unmount();
    });

    it('sets auth context with requiresRestart: true for LOGIN_WITH_GOOGLE', async () => {
      mockedValidateAuthMethod.mockReturnValue(null);
      const { waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.LOGIN_WITH_GOOGLE);

      expect(props.setAuthContext).toHaveBeenCalledWith({
        requiresRestart: true,
      });
      unmount();
    });

    it('sets auth context with empty object for other auth types', async () => {
      mockedValidateAuthMethod.mockReturnValue(null);
      const { waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthContext).toHaveBeenCalledWith({});
      unmount();
    });

    it('skips API key dialog on initial setup if env var is present', async () => {
      mockedValidateAuthMethod.mockReturnValue(null);
      vi.stubEnv('GEMINI_API_KEY', 'test-key-from-env');
      // props.settings.merged.security.auth.selectedType is undefined here, simulating initial setup

      const { waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.Unauthenticated,
      );
      unmount();
    });

    it('skips API key dialog if env var is present but empty', async () => {
      mockedValidateAuthMethod.mockReturnValue(null);
      vi.stubEnv('GEMINI_API_KEY', ''); // Empty string
      // props.settings.merged.security.auth.selectedType is undefined here

      const { waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.Unauthenticated,
      );
      unmount();
    });

    it('shows API key dialog on initial setup if no env var is present', async () => {
      mockedValidateAuthMethod.mockReturnValue(null);
      // process.env['GEMINI_API_KEY'] is not set
      // props.settings.merged.security.auth.selectedType is undefined here, simulating initial setup

      const { waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.AwaitingApiKeyInput,
      );
      unmount();
    });

    it('skips API key dialog on re-auth if env var is present (cannot edit)', async () => {
      mockedValidateAuthMethod.mockReturnValue(null);
      vi.stubEnv('GEMINI_API_KEY', 'test-key-from-env');
      // Simulate that the user has already authenticated once
      props.settings.merged.security.auth.selectedType =
        AuthType.LOGIN_WITH_GOOGLE;

      const { waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await handleAuthSelect(AuthType.USE_GEMINI);

      expect(props.setAuthState).toHaveBeenCalledWith(
        AuthState.Unauthenticated,
      );
      unmount();
    });

    it('exits process for Login with Google when browser is suppressed', async () => {
      vi.useFakeTimers();
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(debugLogger, 'log').mockImplementation(() => {});
      vi.mocked(props.config.isBrowserLaunchSuppressed).mockReturnValue(true);
      mockedValidateAuthMethod.mockReturnValue(null);

      const { waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      const { onSelect: handleAuthSelect } =
        mockedRadioButtonSelect.mock.calls[0][0];
      await act(async () => {
        await handleAuthSelect(AuthType.LOGIN_WITH_GOOGLE);
        await vi.runAllTimersAsync();
      });

      expect(mockedRunExitCleanup).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      vi.useRealTimers();
      unmount();
    });
  });

  it('displays authError when provided', async () => {
    props.authError = 'Something went wrong';
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <AuthDialog {...props} />,
    );
    await waitUntilReady();
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
      const { waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      const keypressHandler = mockedUseKeypress.mock.calls[0][0];
      keypressHandler({ name: 'escape' });
      expectations(props);
      unmount();
    });
  });

  describe('Snapshots', () => {
    it('renders correctly with default props', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders correctly with auth error', async () => {
      props.authError = 'Something went wrong';
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });

    it('renders correctly with enforced auth type', async () => {
      props.settings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <AuthDialog {...props} />,
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot();
      unmount();
    });
  });
});
