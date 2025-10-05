/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef } from 'react';
import { autocompleteSystem } from './AutocompleteSystem';
import type { AutocompleteItem, AutocompleteMatch } from './types';

interface UseAutocompleteProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  onSelectionChange?: (start: number, end: number) => void;
}

export const useAutocomplete = ({
  textareaRef,
  value,
  onChange,
  onSelectionChange
}: UseAutocompleteProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [items, setItems] = useState<AutocompleteItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [currentMatch, setCurrentMatch] = useState<AutocompleteMatch | null>(null);

  const loadingRef = useRef(false);

  const hideAutocomplete = useCallback(() => {
    setIsVisible(false);
    setItems([]);
    setCurrentMatch(null);
    setSelectedIndex(0);

    // Return focus to textarea after closing
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [textareaRef]);

  const showAutocomplete = useCallback(async (match: AutocompleteMatch, textareaElement: HTMLTextAreaElement) => {
    // Don't block if already loading - just update the current match
    loadingRef.current = true;

    try {
      const items = await match.provider.getItems(match.query);

      // Only proceed if we got items
      if (items && items.length > 0) {
        setItems(items);
        setCurrentMatch(match);
        setSelectedIndex(0);

        // Calculate position for dropdown
        const cursorPosition = getCursorPosition(textareaElement, match.startPos);

        // Dropdown dimensions (accounting for filter bar + items)
        const dropdownWidth = 384; // w-96 = 24rem = 384px
        const dropdownHeight = 400; // filter bar (~50px) + max-h-80 (~320px) + margin
        const margin = 20;

        // Calculate available space
        const spaceBelow = window.innerHeight - cursorPosition.top - cursorPosition.height;
        const spaceAbove = cursorPosition.top;
        const spaceRight = window.innerWidth - cursorPosition.left;

        let top: number;
        let left: number;

        // Determine vertical position
        if (spaceBelow >= dropdownHeight + margin) {
          // Show below cursor
          top = cursorPosition.top + cursorPosition.height + 4;
        } else if (spaceAbove >= dropdownHeight + margin) {
          // Show above cursor
          top = cursorPosition.top - dropdownHeight - 4;
        } else {
          // Not enough space either way, prefer below but constrain
          top = Math.max(margin, window.innerHeight - dropdownHeight - margin);
        }

        // Determine horizontal position
        if (spaceRight >= dropdownWidth + margin) {
          // Show at cursor position
          left = cursorPosition.left;
        } else {
          // Align to right edge with margin
          left = window.innerWidth - dropdownWidth - margin;
        }

        setPosition({ top, left });

        setIsVisible(true);
      } else {
        hideAutocomplete();
      }
    } catch (error) {
      console.error('Failed to load autocomplete items:', error);
      hideAutocomplete();
    } finally {
      loadingRef.current = false;
    }
  }, [hideAutocomplete]);

  const selectItem = useCallback((item: AutocompleteItem) => {
    if (!currentMatch) return;

    const { newText, newCursorPos } = autocompleteSystem.applyCompletion(
      value,
      currentMatch,
      item.value
    );

    onChange(newText);
    hideAutocomplete();

    // Set cursor position after text update
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
        onSelectionChange?.(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [currentMatch, value, onChange, hideAutocomplete, textareaRef, onSelectionChange]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!isVisible || items.length === 0) return false;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex(prev => (prev + 1) % items.length);
        return true;

      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex(prev => (prev - 1 + items.length) % items.length);
        return true;

      case 'Enter':
      case 'Tab':
        event.preventDefault();
        if (items[selectedIndex]) {
          selectItem(items[selectedIndex]);
        }
        return true;

      case 'Escape':
        event.preventDefault();
        hideAutocomplete();
        return true;

      case 'Backspace':
      case 'Delete':
        // Let the key pass through, but we'll check for autocomplete after
        return false;

      default:
        return false;
    }
  }, [isVisible, items, selectedIndex, selectItem, hideAutocomplete]);

  const checkForAutocomplete = useCallback(async (text: string, cursorPos: number) => {
    const match = autocompleteSystem.findMatch(text, cursorPos);

    if (match && textareaRef.current) {
      // Force refresh workspace directories when @ is triggered
      if (match.provider.name === 'Workspace Directories' && match.provider.forceRefresh) {
        await match.provider.forceRefresh();
      }
      showAutocomplete(match, textareaRef.current);
    } else {
      hideAutocomplete();
    }
  }, [showAutocomplete, hideAutocomplete, textareaRef]);

  return {
    isVisible,
    items,
    selectedIndex,
    position,
    selectItem,
    hideAutocomplete,
    handleKeyDown,
    checkForAutocomplete
  };
};

// Helper function to calculate cursor position in textarea
function getCursorPosition(textarea: HTMLTextAreaElement, _index: number) {
  // Simple approach: use textarea positioning relative to viewport
  const textareaRect = textarea.getBoundingClientRect();
  const style = getComputedStyle(textarea);

  // Position the dropdown above the textarea to avoid blocking the input
  // Dropdown height is approximately 400-500px, position it above
  const dropdownHeight = 450; // Approximate height with filters + items

  return {
    top: textareaRect.top + window.scrollY - dropdownHeight - 8, // 8px gap above textarea
    left: textareaRect.left + window.scrollX + parseInt(style.paddingLeft, 10),
    height: 20
  };
}