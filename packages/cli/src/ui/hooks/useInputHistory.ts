import { useState, useCallback } from 'react';
import { useInput } from 'ink';

interface UseInputHistoryProps {
  userMessages: readonly string[]; // Use readonly string[] instead
  isActive: boolean; // To enable/disable the useInput hook
}

interface UseInputHistoryReturn {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  resetHistoryNav: () => void;
  inputKey: number; // Key to force input reset
}

export function useInputHistory({
  userMessages,
  isActive,
}: UseInputHistoryProps): UseInputHistoryReturn {
  const [query, setQuery] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number>(-1); // -1 means current query
  const [originalQueryBeforeNav, setOriginalQueryBeforeNav] =
    useState<string>('');
  const [inputKey, setInputKey] = useState<number>(0); // Add key state

  const resetHistoryNav = useCallback(() => {
    setHistoryIndex(-1);
    setOriginalQueryBeforeNav('');
    // Don't reset inputKey here, only on explicit nav actions
  }, []);

  useInput(
    (input, key) => {
      // Do nothing if the hook is not active
      if (!isActive) {
        return;
      }

      if (key.upArrow) {
        if (userMessages.length === 0) return;
        // Store current query if starting navigation
        if (historyIndex === -1) {
          setOriginalQueryBeforeNav(query);
        }
        const nextIndex = Math.min(historyIndex + 1, userMessages.length - 1);
        if (nextIndex !== historyIndex) {
          setHistoryIndex(nextIndex);
          const newValue = userMessages[userMessages.length - 1 - nextIndex];
          setQuery(newValue);
          setInputKey(k => k + 1); // Increment key on navigation change
        }
      } else if (key.downArrow) {
        if (historyIndex < 0) return; // Already at the bottom
        const nextIndex = Math.max(historyIndex - 1, -1);
        setHistoryIndex(nextIndex);
        if (nextIndex === -1) {
          // Restore original query
          setQuery(originalQueryBeforeNav);
          setInputKey(k => k + 1); // Increment key on navigation change
        } else {
          // Set query based on reversed index
          const newValue = userMessages[userMessages.length - 1 - nextIndex];
          setQuery(newValue);
          setInputKey(k => k + 1); // Increment key on navigation change
        }
      } else {
        // If user types anything other than arrows, reset history navigation state
        // This check might be too broad, adjust if handling more special keys
        if (
          input ||
          key.backspace ||
          key.delete ||
          key.leftArrow ||
          key.rightArrow
        ) {
          if (historyIndex !== -1) {
            resetHistoryNav();
            // Note: The actual input change is handled by the component using setQuery/onChange
          }
        }
      }
    },
    { isActive }, // Pass isActive to useInput
  );

  return {
    query,
    setQuery, // Return setQuery directly for flexibility
    resetHistoryNav,
    inputKey, // Return the key
  };
}
