// packages/cli/src/ui/contexts/SudoContext.tsx

import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  useMemo,
} from 'react';

const SUDO_CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface SudoContextType {
  getPassword: () => string | undefined;
  setPassword: (password: string) => void;
}

const SudoContext = createContext<SudoContextType | undefined>(undefined);

export const SudoProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [password, setPasswordState] = useState<string | undefined>();
  const [timestamp, setTimestamp] = useState<number | undefined>();

  const setPassword = useCallback((newPassword: string) => {
    setPasswordState(newPassword);
    setTimestamp(Date.now());
  }, []);

  const getPassword = useCallback(() => {
    if (
      password &&
      timestamp &&
      Date.now() - timestamp < SUDO_CACHE_DURATION_MS
    ) {
      return password;
    }
    // Clear expired password
    if (password) {
      setPasswordState(undefined);
      setTimestamp(undefined);
    }
    return undefined;
  }, [password, timestamp]);

  const value = useMemo(
    () => ({ getPassword, setPassword }),
    [getPassword, setPassword],
  );

  return <SudoContext.Provider value={value}>{children}</SudoContext.Provider>;
};

export const useSudo = (): SudoContextType => {
  const context = useContext(SudoContext);
  if (context === undefined) {
    throw new Error('useSudo must be used within a SudoProvider');
  }
  return context;
};