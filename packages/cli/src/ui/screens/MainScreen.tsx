/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Box, useApp } from 'ink';
import type { SessionEngine, SessionMessage } from '@zoe/core';
import type { CommandRegistry } from '../../commands/CommandRegistry.js';
import { Header } from '../components/Header.js';
import { MessageList } from '../components/MessageList.js';
import { InputPrompt } from '../input/InputPrompt.js';

export interface MainScreenProps {
  session: SessionEngine;
  commands: CommandRegistry;
}

export function MainScreen({ session, commands }: MainScreenProps): React.JSX.Element {
  const { exit } = useApp();
  const [messages, setMessages] = useState<SessionMessage[]>(session.getMessages());
  const [state, setState] = useState(session.getState());

  useEffect(() => {
    const updateMessages = () => {
      setMessages(session.getMessages());
    };

    const updateState = (data: { state: 'idle' | 'processing' | 'error' }) => {
      setState(data.state);
      updateMessages();
    };

    session.events.on('user:input', updateMessages);
    session.events.on('runtime:message', updateMessages);
    session.events.on('history:cleared', updateMessages);
    session.events.on('runtime:state', updateState);

    return () => {
      session.events.off('user:input', updateMessages);
      session.events.off('runtime:message', updateMessages);
      session.events.off('history:cleared', updateMessages);
      session.events.off('runtime:state', updateState);
    };
  }, [session]);

  const handleSubmit = useCallback(
    async (value: string) => {
      if (commands.isCommand(value)) {
        const result = await commands.execute(value, { session, exit });
        if (result) {
          session.addSystemMessage(result);
          setMessages(session.getMessages());
        }
        return;
      }

      await session.send(value);
    },
    [commands, session, exit]
  );

  const handleExit = useCallback(() => {
    session.end('user_exit');
    exit();
  }, [session, exit]);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Header />
      <MessageList messages={messages} />
      <InputPrompt
        onSubmit={handleSubmit}
        onExit={handleExit}
        isDisabled={state === 'processing'}
      />
    </Box>
  );
}
