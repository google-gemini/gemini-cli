/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageMappingsManager } from './LanguageMappingsManager';
import * as languageUtils from '../utils/language';

// Mock the language utils. This will be hoisted.
vi.mock('../utils/language', () => ({
  getLanguageMap: vi.fn(),
  saveLanguageMap: vi.fn(),
}));

describe('LanguageMappingsManager', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
  });

  it('should load and display initial language mappings', async () => {
    const initialMappings = {
      ts: 'typescript',
      js: 'javascript',
    };
    // Cast to mock to set return value
    (languageUtils.getLanguageMap as import('vitest').Mock).mockResolvedValue(initialMappings);

    render(<LanguageMappingsManager />);

    await waitFor(() => {
      expect(languageUtils.getLanguageMap).toHaveBeenCalledTimes(1);
      expect(screen.getByText('.ts → typescript')).toBeInTheDocument();
      expect(screen.getByText('.js → javascript')).toBeInTheDocument();
    });
  });

  it('should add a new mapping when the "Add" button is clicked', () => {
    (languageUtils.getLanguageMap as import('vitest').Mock).mockReturnValue({});
    render(<LanguageMappingsManager />);

    const extInput = screen.getByPlaceholderText('.ext') as HTMLInputElement;
    const langInput = screen.getByPlaceholderText(
      'language',
    ) as HTMLInputElement;
    const addButton = screen.getByText('Add');

    fireEvent.change(extInput, { target: { value: '.py' } });
    fireEvent.change(langInput, { target: { value: 'python' } });
    fireEvent.click(addButton);

    expect(screen.getByText('.py → python')).toBeInTheDocument();

    // Check if saveLanguageMap was called with the correct data
    expect(languageUtils.saveLanguageMap).toHaveBeenCalledWith({
      py: 'python',
    });

    // Check if input fields are cleared
    expect(extInput.value).toBe('');
    expect(langInput.value).toBe('');
  });

  it('should handle adding an extension without a leading dot', () => {
    (languageUtils.getLanguageMap as import('vitest').Mock).mockReturnValue({});
    render(<LanguageMappingsManager />);

    const extInput = screen.getByPlaceholderText('.ext');
    const langInput = screen.getByPlaceholderText('language');
    const addButton = screen.getByText('Add');

    fireEvent.change(extInput, { target: { value: 'java' } });
    fireEvent.change(langInput, { target: { value: 'java' } });
    fireEvent.click(addButton);

    expect(screen.getByText('.java → java')).toBeInTheDocument();
    expect(languageUtils.saveLanguageMap).toHaveBeenCalledWith({
      java: 'java',
    });
  });

  it('should remove a mapping when the remove button is clicked', async () => {
    const initialMappings = {
      ts: 'typescript',
      js: 'javascript',
    };
    (languageUtils.getLanguageMap as import('vitest').Mock).mockResolvedValue(initialMappings);

    render(<LanguageMappingsManager />);

    await waitFor(async () => {
      expect(screen.getByText('.ts → typescript')).toBeInTheDocument();

      // There are two remove buttons, get the one for the 'ts' mapping
      const tsMappingItem = screen
        .getByText('.ts → typescript')
        .closest('.mapping-item');
      const removeButton = tsMappingItem?.querySelector(
        '.remove-button',
      ) as HTMLElement;

      fireEvent.click(removeButton);

      // Check that the mapping is removed from the UI
      expect(screen.queryByText('.ts → typescript')).not.toBeInTheDocument();

      // Check that the other mapping still exists
      expect(screen.getByText('.js → javascript')).toBeInTheDocument();

      // Check that saveLanguageMap was called with the mapping removed
      expect(languageUtils.saveLanguageMap).toHaveBeenCalledWith({
        js: 'javascript',
      });
    });
  });

  it('should not add a mapping if extension or language is empty', () => {
    (languageUtils.getLanguageMap as import('vitest').Mock).mockReturnValue({});
    render(<LanguageMappingsManager />);

    const addButton = screen.getByText('Add');

    // Both empty
    fireEvent.click(addButton);
    expect(languageUtils.saveLanguageMap).not.toHaveBeenCalled();

    // Only extension
    const extInput = screen.getByPlaceholderText('.ext');
    fireEvent.change(extInput, { target: { value: '.css' } });
    fireEvent.click(addButton);
    expect(languageUtils.saveLanguageMap).not.toHaveBeenCalled();

    // Only language
    const langInput = screen.getByPlaceholderText('language');
    fireEvent.change(extInput, { target: { value: '' } });
    fireEvent.change(langInput, { target: { value: 'css' } });
    fireEvent.click(addButton);
    expect(languageUtils.saveLanguageMap).not.toHaveBeenCalled();
  });
});
