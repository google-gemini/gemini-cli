/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { act } from 'react-dom/test-utils';
import {
  MultiFolderTrustDialog,
  MultiFolderTrustChoice,
  type MultiFolderTrustDialogProps,
} from './MultiFolderTrustDialog.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  TrustLevel,
  type LoadedTrustedFolders,
} from '../../config/trustedFolders.js';
import * as trustedFolders from '../../config/trustedFolders.js';
import * as directoryUtils from '../utils/directoryUtils.js';
import type { Config } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

// Mocks
vi.mock('../hooks/useKeypress.js');
vi.mock('../../config/trustedFolders.js');
vi.mock('../utils/directoryUtils.js');
vi.mock('./shared/RadioButtonSelect.js');

const mockedUseKeypress = vi.mocked(useKeypress);
const mockedRadioButtonSelect = vi.mocked(RadioButtonSelect);

const mockOnComplete = vi.fn();
const mockFinishAddingDirectories = vi.fn();
const mockAddItem = vi.fn();
const mockAddDirectory = vi.fn();
const mockSetValue = vi.fn();

const mockConfig = {
  getWorkspaceContext: () => ({
    addDirectory: mockAddDirectory,
  }),
} as unknown as Config;

const mockTrustedFolders = {
  setValue: mockSetValue,
} as unknown as LoadedTrustedFolders;

const defaultProps: MultiFolderTrustDialogProps = {
  folders: [],
  onComplete: mockOnComplete,
  trustedDirs: [],
  errors: [],
  finishAddingDirectories: mockFinishAddingDirectories,
  config: mockConfig,
  addItem: mockAddItem,
};

describe('MultiFolderTrustDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(trustedFolders.loadTrustedFolders).mockReturnValue(
      mockTrustedFolders,
    );
    vi.mocked(directoryUtils.expandHomeDir).mockImplementation((path) => path);
    mockedRadioButtonSelect.mockImplementation((props) => (
      <div data-testid="RadioButtonSelect" {...props} />
    ));
  });

  it('renders the dialog with the list of folders', () => {
    const folders = ['/path/to/folder1', '/path/to/folder2'];
    const { lastFrame } = render(
      <MultiFolderTrustDialog {...defaultProps} folders={folders} />,
    );

    expect(lastFrame()).toContain(
      'Do you trust the following folders being added to this workspace?',
    );
    expect(lastFrame()).toContain('- /path/to/folder1');
    expect(lastFrame()).toContain('- /path/to/folder2');
  });

  it('calls onComplete and finishAddingDirectories with an error on escape', async () => {
    const folders = ['/path/to/folder1'];
    render(<MultiFolderTrustDialog {...defaultProps} folders={folders} />);

    const keypressCallback = mockedUseKeypress.mock.calls[0][0];
    await act(async () => {
      keypressCallback({
        name: 'escape',
        ctrl: false,
        meta: false,
        shift: false,
        sequence: '',
        insertable: false,
      });
    });

    expect(mockFinishAddingDirectories).toHaveBeenCalledWith(
      mockConfig,
      mockAddItem,
      [],
      [
        'Operation cancelled. The following directories were not added:\n- /path/to/folder1',
      ],
    );
    expect(mockOnComplete).toHaveBeenCalled();
  });

  it('calls finishAddingDirectories with an error and does not add directories when "No" is chosen', async () => {
    const folders = ['/path/to/folder1'];
    render(<MultiFolderTrustDialog {...defaultProps} folders={folders} />);

    const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
    await act(async () => {
      onSelect(MultiFolderTrustChoice.NO);
    });

    expect(mockFinishAddingDirectories).toHaveBeenCalledWith(
      mockConfig,
      mockAddItem,
      [],
      [
        'The following directories were not added because they were not trusted:\n- /path/to/folder1',
      ],
    );
    expect(mockOnComplete).toHaveBeenCalled();
    expect(mockAddDirectory).not.toHaveBeenCalled();
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  it('adds directories to workspace context when "Yes" is chosen', async () => {
    const folders = ['/path/to/folder1', '/path/to/folder2'];
    render(
      <MultiFolderTrustDialog
        {...defaultProps}
        folders={folders}
        trustedDirs={['/already/trusted']}
      />,
    );

    const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
    await act(async () => {
      onSelect(MultiFolderTrustChoice.YES);
    });

    expect(mockAddDirectory).toHaveBeenCalledWith('/path/to/folder1');
    expect(mockAddDirectory).toHaveBeenCalledWith('/path/to/folder2');
    expect(mockSetValue).not.toHaveBeenCalled();
    expect(mockFinishAddingDirectories).toHaveBeenCalledWith(
      mockConfig,
      mockAddItem,
      ['/already/trusted', '/path/to/folder1', '/path/to/folder2'],
      [],
    );
    expect(mockOnComplete).toHaveBeenCalled();
  });

  it('adds directories to workspace context and remembers them as trusted when "Yes, and remember" is chosen', async () => {
    const folders = ['/path/to/folder1'];
    render(<MultiFolderTrustDialog {...defaultProps} folders={folders} />);

    const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
    await act(async () => {
      onSelect(MultiFolderTrustChoice.YES_AND_REMEMBER);
    });

    expect(mockAddDirectory).toHaveBeenCalledWith('/path/to/folder1');
    expect(mockSetValue).toHaveBeenCalledWith(
      '/path/to/folder1',
      TrustLevel.TRUST_FOLDER,
    );
    expect(mockFinishAddingDirectories).toHaveBeenCalledWith(
      mockConfig,
      mockAddItem,
      ['/path/to/folder1'],
      [],
    );
    expect(mockOnComplete).toHaveBeenCalled();
  });

  it('shows submitting message after a choice is made', async () => {
    const folders = ['/path/to/folder1'];
    const { lastFrame } = render(
      <MultiFolderTrustDialog {...defaultProps} folders={folders} />,
    );

    const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];

    await act(async () => {
      onSelect(MultiFolderTrustChoice.NO);
    });

    expect(lastFrame()).toContain('Applying trust settings...');
  });

  it('shows an error message and completes when config is missing', async () => {
    const folders = ['/path/to/folder1'];
    render(
      <MultiFolderTrustDialog
        {...defaultProps}
        folders={folders}
        config={null as unknown as Config}
      />,
    );

    const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
    await act(async () => {
      onSelect(MultiFolderTrustChoice.YES);
    });

    expect(mockAddItem).toHaveBeenCalledWith({
      type: MessageType.ERROR,
      text: 'Configuration is not available.',
    });
    expect(mockOnComplete).toHaveBeenCalled();
    expect(mockFinishAddingDirectories).not.toHaveBeenCalled();
  });

  it('collects and reports errors when some directories fail to be added', async () => {
    vi.mocked(directoryUtils.expandHomeDir).mockImplementation((path) => {
      if (path === '/path/to/error') {
        throw new Error('Test error');
      }
      return path;
    });

    const folders = ['/path/to/good', '/path/to/error'];
    render(
      <MultiFolderTrustDialog
        {...defaultProps}
        folders={folders}
        errors={['initial error']}
      />,
    );

    const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
    await act(async () => {
      onSelect(MultiFolderTrustChoice.YES);
    });

    expect(mockAddDirectory).toHaveBeenCalledWith('/path/to/good');
    expect(mockAddDirectory).not.toHaveBeenCalledWith('/path/to/error');
    expect(mockFinishAddingDirectories).toHaveBeenCalledWith(
      mockConfig,
      mockAddItem,
      ['/path/to/good'],
      ['initial error', "Error adding '/path/to/error': Test error"],
    );
    expect(mockOnComplete).toHaveBeenCalled();
  });
});
