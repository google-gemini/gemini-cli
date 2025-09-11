import React, { useMemo, useState } from 'react';
import { render, Box, Text } from 'ink';
import {
  InputPrompt,
  useTextBuffer,
  KeypressProvider,
} from '@google/gemini-cli/ui';
import { Config } from '@google/gemini-cli-core';

function createMinimalConfig(): Config {
  return new Config({
    sessionId: 'demo',
    targetDir: process.cwd(),
    cwd: process.cwd(),
    debugMode: false,
    model: 'gemini-1.5-flash',
    telemetry: { enabled: false },
  });
}

function DemoApp() {
  const config = useMemo(() => createMinimalConfig(), []);

  const [messages, setMessages] = useState<string[]>([]);

  const buffer = useTextBuffer({
    viewport: { width: 80, height: 4 },
    isValidPath: () => true,
  });

  return (
    <KeypressProvider kittyProtocolEnabled={true} config={config}>
      <Box flexDirection="column">
        <Box marginBottom={1}><Text color="green">InputPrompt demo. Type and press Enter. Double-ESC to clear. Prefix with ! to toggle shell mode.</Text></Box>
        <InputPrompt
          buffer={buffer}
          onSubmit={(value) => setMessages((prev) => [value, ...prev])}
          userMessages={messages}
          onClearScreen={() => setMessages([])}
          config={config}
          slashCommands={[]}
          commandContext={{
            services: {
              config,
              settings: {} as any,
              git: undefined,
              logger: console as any,
            },
            ui: {
              addItem: () => {},
              clear: () => {},
              setDebugMessage: () => {},
              pendingItem: null,
              setPendingItem: () => {},
              loadHistory: () => {},
              toggleCorgiMode: () => {},
              toggleVimEnabled: async () => false,
              setGeminiMdFileCount: () => {},
              reloadCommands: () => {},
            },
            session: { stats: {} as any, sessionShellAllowlist: new Set() },
          } as any}
          inputWidth={80}
          suggestionsWidth={80}
          shellModeActive={false}
          setShellModeActive={() => {}}
        />
        <Box flexDirection="column" marginTop={1}>
          {messages.slice(0, 5).map((msg, idx) => (
            <Text key={idx}>{`• ${msg}`}</Text>
          ))}
        </Box>
      </Box>
    </KeypressProvider>
  );
}

render(<DemoApp />);
