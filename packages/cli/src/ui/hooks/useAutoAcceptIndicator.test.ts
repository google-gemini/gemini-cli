/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
  type Mock,
} from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoAcceptIndicator } from './useAutoAcceptIndicator.js';

import type { Config as ActualConfigType } from '@gemini-code/server';
import { useInput, type Key as InkKey } from 'ink';

vi.mock('ink');

vi.mock('@gemini-code/server', async () => {
  const actualServerModule = (await vi.importActual(
    '@gemini-code/server',
  )) as Record<string, unknown>;
  return {
    ...actualServerModule,
    Config: vi.fn(),
  };
});

import { Config } from '@gemini-code/server';

interface MockConfigInstanceShape {
  getAlwaysSkipModificationConfirmation: Mock<() => boolean>;
  setAlwaysSkipModificationConfirmation: Mock<(value: boolean) => void>;
  getCoreTools: Mock<() => string[]>;
  getToolDiscoveryCommand: Mock<() => string | undefined>;
  getTargetDir: Mock<() => string>;
  getApiKey: Mock<() => string>;
  getModel: Mock<() => string>;
  getSandbox: Mock<() => boolean | string>;
  getDebugMode: Mock<() => boolean>;
  getQuestion: Mock<() => string | undefined>;
  getFullContext: Mock<() => boolean>;
  getUserAgent: Mock<() => string>;
  getUserMemory: Mock<() => string>;
  getGeminiMdFileCount: Mock<() => number>;
  getToolRegistry: Mock<() => { discoverTools: Mock<() => void> }>;
}

type UseInputKey = InkKey;
type UseInputHandler = (input: string, key: UseInputKey) => void;

describe('useAutoAcceptIndicator', () => {
  let mockConfigInstance: MockConfigInstanceShape;
  let capturedUseInputHandler: UseInputHandler;
  let mockedInkUseInput: MockedFunction<typeof useInput>;

  beforeEach(() => {
    vi.resetAllMocks();

    (
      Config as unknown as MockedFunction<() => MockConfigInstanceShape>
    ).mockImplementation(() => {
      const instanceGetAlwaysSkipMock = vi.fn();
      const instanceSetAlwaysSkipMock = vi.fn();

      const instance: MockConfigInstanceShape = {
        getAlwaysSkipModificationConfirmation:
          instanceGetAlwaysSkipMock as Mock<() => boolean>,
        setAlwaysSkipModificationConfirmation:
          instanceSetAlwaysSkipMock as Mock<(value: boolean) => void>,
        getCoreTools: vi.fn().mockReturnValue([]) as Mock<() => string[]>,
        getToolDiscoveryCommand: vi.fn().mockReturnValue(undefined) as Mock<
          () => string | undefined
        >,
        getTargetDir: vi.fn().mockReturnValue('.') as Mock<() => string>,
        getApiKey: vi.fn().mockReturnValue('test-api-key') as Mock<
          () => string
        >,
        getModel: vi.fn().mockReturnValue('test-model') as Mock<() => string>,
        getSandbox: vi.fn().mockReturnValue(false) as Mock<
          () => boolean | string
        >,
        getDebugMode: vi.fn().mockReturnValue(false) as Mock<() => boolean>,
        getQuestion: vi.fn().mockReturnValue(undefined) as Mock<
          () => string | undefined
        >,
        getFullContext: vi.fn().mockReturnValue(false) as Mock<() => boolean>,
        getUserAgent: vi.fn().mockReturnValue('test-user-agent') as Mock<
          () => string
        >,
        getUserMemory: vi.fn().mockReturnValue('') as Mock<() => string>,
        getGeminiMdFileCount: vi.fn().mockReturnValue(0) as Mock<() => number>,
        getToolRegistry: vi
          .fn()
          .mockReturnValue({ discoverTools: vi.fn() }) as Mock<
          () => { discoverTools: Mock<() => void> }
        >,
      };
      instanceSetAlwaysSkipMock.mockImplementation((value: boolean) => {
        instanceGetAlwaysSkipMock.mockReturnValue(value);
      });
      return instance;
    });

    mockedInkUseInput = useInput as MockedFunction<typeof useInput>;
    mockedInkUseInput.mockImplementation((handler: UseInputHandler) => {
      capturedUseInputHandler = handler;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockConfigInstance = new (Config as any)() as MockConfigInstanceShape;
  });

  it('should initialize with true if config.getAlwaysSkipModificationConfirmation returns true', () => {
    mockConfigInstance.getAlwaysSkipModificationConfirmation.mockReturnValue(
      true,
    );
    const { result } = renderHook(() =>
      useAutoAcceptIndicator({
        config: mockConfigInstance as unknown as ActualConfigType,
      }),
    );
    expect(result.current).toBe(true);
    expect(
      mockConfigInstance.getAlwaysSkipModificationConfirmation,
    ).toHaveBeenCalledTimes(1);
  });

  it('should initialize with false if config.getAlwaysSkipModificationConfirmation returns false', () => {
    mockConfigInstance.getAlwaysSkipModificationConfirmation.mockReturnValue(
      false,
    );
    const { result } = renderHook(() =>
      useAutoAcceptIndicator({
        config: mockConfigInstance as unknown as ActualConfigType,
      }),
    );
    expect(result.current).toBe(false);
    expect(
      mockConfigInstance.getAlwaysSkipModificationConfirmation,
    ).toHaveBeenCalledTimes(1);
  });

  it('should toggle the indicator and update config when Shift+Tab is pressed', () => {
    mockConfigInstance.getAlwaysSkipModificationConfirmation.mockReturnValue(
      false,
    );
    const { result } = renderHook(() =>
      useAutoAcceptIndicator({
        config: mockConfigInstance as unknown as ActualConfigType,
      }),
    );
    expect(result.current).toBe(false);

    act(() => {
      capturedUseInputHandler('', { tab: true, shift: true } as InkKey);
    });
    expect(
      mockConfigInstance.setAlwaysSkipModificationConfirmation,
    ).toHaveBeenCalledWith(true);
    expect(result.current).toBe(true);

    act(() => {
      capturedUseInputHandler('', { tab: true, shift: true } as InkKey);
    });
    expect(
      mockConfigInstance.setAlwaysSkipModificationConfirmation,
    ).toHaveBeenCalledWith(false);
    expect(result.current).toBe(false);
  });

  it('should not toggle if only Tab, only Shift, or other keys are pressed', () => {
    mockConfigInstance.getAlwaysSkipModificationConfirmation.mockReturnValue(
      false,
    );
    renderHook(() =>
      useAutoAcceptIndicator({
        config: mockConfigInstance as unknown as ActualConfigType,
      }),
    );

    act(() => {
      capturedUseInputHandler('', { tab: true, shift: false } as InkKey);
    });
    expect(
      mockConfigInstance.setAlwaysSkipModificationConfirmation,
    ).not.toHaveBeenCalled();

    act(() => {
      capturedUseInputHandler('', { tab: false, shift: true } as InkKey);
    });
    expect(
      mockConfigInstance.setAlwaysSkipModificationConfirmation,
    ).not.toHaveBeenCalled();

    act(() => {
      capturedUseInputHandler('a', { tab: false, shift: false } as InkKey);
    });
    expect(
      mockConfigInstance.setAlwaysSkipModificationConfirmation,
    ).not.toHaveBeenCalled();
  });

  it('should update indicator when config value changes externally (useEffect dependency)', () => {
    mockConfigInstance.getAlwaysSkipModificationConfirmation.mockReturnValue(
      false,
    );
    const { result, rerender } = renderHook(
      (props: { config: ActualConfigType }) => useAutoAcceptIndicator(props),
      {
        initialProps: {
          config: mockConfigInstance as unknown as ActualConfigType,
        },
      },
    );
    expect(result.current).toBe(false);

    mockConfigInstance.getAlwaysSkipModificationConfirmation.mockReturnValue(
      true,
    );

    rerender({ config: mockConfigInstance as unknown as ActualConfigType });
    expect(result.current).toBe(true);
    expect(
      mockConfigInstance.getAlwaysSkipModificationConfirmation,
    ).toHaveBeenCalledTimes(3);
  });
});
