/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useMemo } from 'react';

interface SessionContextType {
  startTime: Date;
}

const SessionContext = createContext<SessionContextType | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [startTime] = useState(new Date());

  const value = useMemo(
    () => ({
      startTime,
    }),
    [startTime],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};
