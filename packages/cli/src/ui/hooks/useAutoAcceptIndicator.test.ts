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

import {
  Config,
  Config as ActualConfigType,
  ApprovalMode,
} from '@google/gemini-cli-core';
import { useKeypress, Key } from './useKeypress.js';

vi.mock('./useKeypress.js');

vi.mock('@google/gemini-cli-core', async () => {
  const actualServerModule = (await vi.importActual(
    '@google/gemini-cli-core',
  )) as Record<string, unknown>;
  return {
    ...actualServerModule,
    Config: vi.fn(),
  };
});

interface MockConfigInstanceShape {
  getApprovalMode: Mock<() => ApprovalMode>;
  setApprovalMode: Mock<(value: ApprovalMode) => void>;
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

type UseKeypressHandler = (key: Key) => void;

describe('useAutoAcceptIndicator', () => {
  let mockConfigInstance: MockConfigInstanceShape;
  let capturedUseKeypressHandler: UseKeypressHandler;
  let mockedUseKeypress: MockedFunction<typeof useKeypress>;

  beforeEach(() => {
    vi.resetAllMocks();

    (
      Config as unknown as MockedFunction<() => MockConfigInstanceShape>
    ).mockImplementation(() => {
      const instanceGetApprovalModeMock = vi.fn();
      const instanceSetApprovalModeMock = vi.fn();

      const instance: MockConfigInstanceShape = {
        getApprovalMode: instanceGetApprovalModeMock as Mock<
          () => ApprovalMode
        >,
        setApprovalMode: instanceSetApprovalModeMock as Mock<
          (value: ApprovalMode) => void
        >,
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
      instanceSetApprovalModeMock.mockImplementation((value: ApprovalMode) => {
        instanceGetApprovalModeMock.mockReturnValue(value);
      });
      return instance;
    });

    mockedUseKeypress = useKeypress as MockedFunction<typeof useKeypress>;
    mockedUseKeypress.mockImplementation(
      (handler: UseKeypressHandler, _options) => {
        capturedUseKeypressHandler = handler;
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockConfigInstance = new (Config as any)() as MockConfigInstanceShape;
  });

  it('should initialize with ApprovalMode.AUTO_EDIT if config.getApprovalMode returns ApprovalMode.AUTO_EDIT', () => {
    mockConfigInstance.getApprovalMode.mockReturnValue(ApprovalMode.AUTO_EDIT);
    const { result } = renderHook(() =>
      useAutoAcceptIndicator({
        config: mockConfigInstance as unknown as ActualConfigType,
      }),
    );
    expect(result.current).toBe(ApprovalMode.AUTO_EDIT);
    expect(mockConfigInstance.getApprovalMode).toHaveBeenCalledTimes(1);
  });

  it('should initialize with ApprovalMode.DEFAULT if config.getApprovalMode returns ApprovalMode.DEFAULT', () => {
    mockConfigInstance.getApprovalMode.mockReturnValue(ApprovalMode.DEFAULT);
    const { result } = renderHook(() =>
      useAutoAcceptIndicator({
        config: mockConfigInstance as unknown as ActualConfigType,
      }),
    );
    expect(result.current).toBe(ApprovalMode.DEFAULT);
    expect(mockConfigInstance.getApprovalMode).toHaveBeenCalledTimes(1);
  });

  it('should initialize with ApprovalMode.YOLO if config.getApprovalMode returns ApprovalMode.YOLO', () => {
    mockConfigInstance.getApprovalMode.mockReturnValue(ApprovalMode.YOLO);
    const { result } = renderHook(() =>
      useAutoAcceptIndicator({
        config: mockConfigInstance as unknown as ActualConfigType,
      }),
    );
    expect(result.current).toBe(ApprovalMode.YOLO);
    expect(mockConfigInstance.getApprovalMode).toHaveBeenCalledTimes(1);
  });

  it('should toggle the indicator and update config when Shift+Tab or Ctrl+Y is pressed', () => {
    mockConfigInstance.getApprovalMode.mockReturnValue(ApprovalMode.DEFAULT);
    const { result } = renderHook(() =>
      useAutoAcceptIndicator({
        config: mockConfigInstance as unknown as ActualConfigType,
      }),
    );
    expect(result.current).toBe(ApprovalMode.DEFAULT);

    act(() => {
      capturedUseKeypressHandler({
        name: 'tab',
        shift: true,
      } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).toHaveBeenCalledWith(
      ApprovalMode.AUTO_EDIT,
    );
    expect(result.current).toBe(ApprovalMode.AUTO_EDIT);

    act(() => {
      capturedUseKeypressHandler({ name: 'y', ctrl: true } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).toHaveBeenCalledWith(
      ApprovalMode.YOLO,
    );
    expect(result.current).toBe(ApprovalMode.YOLO);

    act(() => {
      capturedUseKeypressHandler({ name: 'y', ctrl: true } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).toHaveBeenCalledWith(
      ApprovalMode.DEFAULT,
    );
    expect(result.current).toBe(ApprovalMode.DEFAULT);

    act(() => {
      capturedUseKeypressHandler({ name: 'y', ctrl: true } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).toHaveBeenCalledWith(
      ApprovalMode.YOLO,
    );
    expect(result.current).toBe(ApprovalMode.YOLO);

    act(() => {
      capturedUseKeypressHandler({
        name: 'tab',
        shift: true,
      } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).toHaveBeenCalledWith(
      ApprovalMode.AUTO_EDIT,
    );
    expect(result.current).toBe(ApprovalMode.AUTO_EDIT);

    act(() => {
      capturedUseKeypressHandler({
        name: 'tab',
        shift: true,
      } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).toHaveBeenCalledWith(
      ApprovalMode.DEFAULT,
    );
    expect(result.current).toBe(ApprovalMode.DEFAULT);
  });

  it('should not toggle if only one key or other keys combinations are pressed', () => {
    mockConfigInstance.getApprovalMode.mockReturnValue(ApprovalMode.DEFAULT);
    renderHook(() =>
      useAutoAcceptIndicator({
        config: mockConfigInstance as unknown as ActualConfigType,
      }),
    );

    act(() => {
      capturedUseKeypressHandler({
        name: 'tab',
        shift: false,
      } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).not.toHaveBeenCalled();

    act(() => {
      capturedUseKeypressHandler({
        name: 'unknown',
        shift: true,
      } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).not.toHaveBeenCalled();

    act(() => {
      capturedUseKeypressHandler({
        name: 'a',
        shift: false,
        ctrl: false,
      } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).not.toHaveBeenCalled();

    act(() => {
      capturedUseKeypressHandler({ name: 'y', ctrl: false } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).not.toHaveBeenCalled();

    act(() => {
      capturedUseKeypressHandler({ name: 'a', ctrl: true } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).not.toHaveBeenCalled();

    act(() => {
      capturedUseKeypressHandler({ name: 'y', shift: true } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).not.toHaveBeenCalled();

    act(() => {
      capturedUseKeypressHandler({
        name: 'a',
        ctrl: true,
        shift: true,
      } as Key);
    });
    expect(mockConfigInstance.setApprovalMode).not.toHaveBeenCalled();
  });

  it('should update indicator when config value changes externally (useEffect dependency)', () => {
    mockConfigInstance.getApprovalMode.mockReturnValue(ApprovalMode.DEFAULT);
    const { result, rerender } = renderHook(
      (props: { config: ActualConfigType }) => useAutoAcceptIndicator(props),
      {
        initialProps: {
          config: mockConfigInstance as unknown as ActualConfigType,
        },
      },
    );
    expect(result.current).toBe(ApprovalMode.DEFAULT);

    mockConfigInstance.getApprovalMode.mockReturnValue(ApprovalMode.AUTO_EDIT);

    rerender({ config: mockConfigInstance as unknown as ActualConfigType });
    expect(result.current).toBe(ApprovalMode.AUTO_EDIT);
    expect(mockConfigInstance.getApprovalMode).toHaveBeenCalledTimes(3);
  });
});
